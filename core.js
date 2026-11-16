/* Spendly · Firebase setup, configuration, shared state and date helpers.
   Classic script: shares global scope with the other js/ files; load order is set in index.html. */

/* ---------------- Firebase ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyDwTNP04aAS1HZ2B7JOn_9ullSvd1fqfbk",
  authDomain: "expense-tracker-ff67b.firebaseapp.com",
  projectId: "expense-tracker-ff67b",
  storageBucket: "expense-tracker-ff67b.firebasestorage.app",
  messagingSenderId: "680384452888",
  appId: "1:680384452888:web:de60cec077929ec5dee66d"
};
firebase.initializeApp(firebaseConfig);

// App Check (Fraud Defense / reCAPTCHA Enterprise) — must run before Firestore/Auth are used
const RECAPTCHA_ENTERPRISE_KEY = "6LeWlhUuAAAAANbt2XgzcoTnZior0PBCTBOD0qKD";
firebase.appCheck().activate(
  new firebase.appCheck.ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_KEY),
  true // auto-refresh tokens
);

const db = firebase.firestore();
// Offline support: keep a local copy of the user's data and queue writes until back online
try { db.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn("Offline persistence unavailable:", err.code)); }
catch(err){ console.warn("Offline persistence unavailable:", err); }
const auth = firebase.auth();
const TS = () => firebase.firestore.FieldValue.serverTimestamp();
let expensesRef = null;   // users/{uid}/expenses
let budgetRef = null;     // users/{uid}/settings/budgets
let catsRef = null;       // users/{uid}/settings/categories
let goalsRef = null;      // users/{uid}/goals
let rulesRef = null;      // users/{uid}/settings/rules
let userRules = [];       // [{match, category, type}]
let goals = [];
let recurringRef = null;  // users/{uid}/recurring
let unsubs = [];
let budgets = {};         // { Food: 300, _total: 1500, ... }
let recurring = [];

/* ---------------- Config ---------------- */
const DEFAULT_CATEGORIES = [
  { name:"Food",          icon:"🍔", color:"#ff6b6b" },
  { name:"Transport",     icon:"🚗", color:"#2e86de" },
  { name:"Shopping",      icon:"🛍️", color:"#ff4d8d" },
  { name:"Bills",         icon:"💡", color:"#feca57" },
  { name:"Entertainment", icon:"🎬", color:"#8854d0" },
  { name:"Health",        icon:"💊", color:"#1dd1a1" },
  { name:"Travel",        icon:"✈️", color:"#00c9a7" },
  { name:"Education",     icon:"📚", color:"#ff9f43" },
  { name:"Other",         icon:"📦", color:"#778ca3" }
];
const INCOME_CATEGORIES = [
  { name:"Salary",       icon:"💼", color:"#10ac84" },
  { name:"Freelance",    icon:"🧑‍💻", color:"#00b894" },
  { name:"Investments",  icon:"📈", color:"#0984e3" },
  { name:"Gifts",        icon:"🎁", color:"#e84393" },
  { name:"Refunds",      icon:"↩️", color:"#00cec9" },
  { name:"Other income", icon:"💵", color:"#6ab04c" }
];
const PAY_OPTIONS = {
  expense: ["Card","Cash","Bank Transfer","Mobile Pay","Other"],
  income:  ["Direct Deposit","Bank Transfer","Cash","Check","Mobile Pay","Other"]
};
let customCats = [];                                    // user-added: [{name, icon, color}]
let CATEGORIES = DEFAULT_CATEGORIES.slice();
let catMap = Object.fromEntries([...CATEGORIES, ...INCOME_CATEGORIES].map(c => [c.name, c]));
const fmt = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n || 0);

/* ---------------- State ---------------- */
let allRecords = [];   // every record (expenses + income), newest first
let expenses = [];     // spending only: drives budgets, insights, the pie chart and the summary cards
let incomes = [];      // income only
let formType = "expense";
const isIncome = e => e.type === "income";
let period = "day";
let anchor = new Date();       // reference date for the chart period
let selectedCat = "Food";
let editingId = null;
let barChart, pieChart;

/* ---------------- Date helpers ---------------- */
const pad = n => String(n).padStart(2,"0");
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseKey = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = d => { const s = startOfDay(d); const diff = (s.getDay()+6)%7; s.setDate(s.getDate()-diff); return s; }; // Monday
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function periodRange(p, a){
  if(p==="day"){ const s=startOfDay(a); return [s, addDays(s,1)]; }
  if(p==="week"){ const s=startOfWeek(a); return [s, addDays(s,7)]; }
  if(p==="month"){ return [new Date(a.getFullYear(),a.getMonth(),1), new Date(a.getFullYear(),a.getMonth()+1,1)]; }
  return [new Date(a.getFullYear(),0,1), new Date(a.getFullYear()+1,0,1)];
}
function inRange(e,[s,t]){ const d = e._date; return d>=s && d<t; }
function sum(arr){ return arr.reduce((a,e)=>a+e.amount,0); }

/* ---------------- Shared helpers ---------------- */
// Escape text for safe use inside HTML
function esc(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
