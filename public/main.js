require('dotenv').config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const CLOUDINARY_UPLOAD_URL = process.env.CLOUDINARY_UPLOAD_URL;
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;

const TEAM_COLORS = {
  pink:   {main: "#FF54D7", name: "Pink"},
  blue:   {main: "#61C3FF", name: "Blue"},
  green:  {main: "#B0FF6F", name: "Green"},
  orange: {main: "#FF955E", name: "Orange"},
  purple: {main: "#B753FF", name: "Purple"}
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();


let currentUser = null, currentTab = "new";
let currentTheme = "pink";
let profileUser = null; 


const loginBox = document.getElementById("loginBox");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginAvatar = document.getElementById("loginAvatar");
const loginBtn = document.getElementById("loginBtn");
const loginErr = document.getElementById("loginErr");
const loginTeamSelect = document.getElementById("loginTeamSelect");
const header = document.getElementById("header");
const userAvatar = document.getElementById("userAvatar");
const userName = document.getElementById("userName");
const mainBox = document.getElementById("mainBox");
const uploadImg = document.getElementById("uploadImg");
const uploadBtn = document.getElementById("uploadBtn");
const uploadErr = document.getElementById("uploadErr");
const tabNew = document.getElementById("tabNew");
const tabTop = document.getElementById("tabTop");
const imagesBox = document.getElementById("imagesBox");
const singleImageBox = document.getElementById("singleImageBox");
const topBar = document.getElementById("topBar");
const logoutBtn = document.getElementById("logoutBtn");
const teamSelect = document.getElementById("teamSelect");


function renderTeamSelect($el, curTeam, cb) {
  $el.innerHTML = "";
  for (const t of Object.keys(TEAM_COLORS)) {
    const b = document.createElement('button');
    b.className = `team-btn ${t}` + (curTeam === t ? " selected" : "");
    b.title = TEAM_COLORS[t].name;
    b.style.background = TEAM_COLORS[t].main;
    b.onclick = () => {
      [...$el.children].forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      cb(t);
    };
    $el.appendChild(b);
  }
}
let loginTeam = "pink";
renderTeamSelect(loginTeamSelect, loginTeam, t => {
  loginTeam = t;
  setTheme(t);
});

function setTheme(team) {
  currentTheme = team;
  document.body.className = team;
  if (logoutBtn) logoutBtn.style.background = TEAM_COLORS[team].main;
  if (loginBox) loginBox.style.setProperty("--team-color", TEAM_COLORS[team].main);
}


loginBtn.onclick = async () => {
  loginErr.textContent = ""; loginBtn.disabled = true;
  try {
    const username = loginUser.value.trim();
    const password = loginPass.value.trim();
    if (!username || !password) throw "Please enter username and password!";
    let userDoc = await getUserByUsername(username);
    let avatarUrl = null;
    if (!userDoc) {
      if (!loginAvatar.files[0]) throw "Please select an avatar image!";
      avatarUrl = await uploadToCloudinary(loginAvatar.files[0], "avatar");
      await db.collection("users").add({
        username, password, team: loginTeam, avatar: avatarUrl, created: Date.now()
      });
    } else {
      const d = userDoc.data();
      if (d.password !== password) throw "Incorrect password!";
      avatarUrl = d.avatar;
      loginTeam = d.team;
    }
    currentUser = {username, team: loginTeam, avatar: avatarUrl || userDoc.data().avatar};
    localStorage.setItem("gprove_user", JSON.stringify(currentUser));
    onLoggedIn();
  } catch (err) {
    loginErr.textContent = err + "";
  }
  loginBtn.disabled = false;
};

logoutBtn.onclick = ()=>{localStorage.removeItem("gprove_user");location.reload();}
function loadUser() {
  const data = localStorage.getItem("gprove_user");
  if (data) currentUser = JSON.parse(data);
  return currentUser;
}
async function getUserByUsername(username) {
  const q = await db.collection("users").where("username", "==", username).limit(1).get();
  return q.empty ? null : q.docs[0];
}
async function uploadToCloudinary(file, type="img") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  if (type === "avatar") formData.append("folder", "avatar");
  const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: formData });
  const data = await res.json();
  if (!data.secure_url) throw "Image upload failed!";
  return data.secure_url;
}

function onLoggedIn() {
  loginBox.style.display = "none";
  mainBox.style.display = "";
  header.style.display = "";
  userAvatar.src = currentUser.avatar;
  userName.textContent = currentUser.username;
  if (teamSelect) teamSelect.style.display = "none";
  setTheme(currentUser.team);
  loadImages();
}

tabNew.onclick = () => { 
  currentTab = "new"; 
  tabNew.classList.add("active"); 
  tabTop.classList.remove("active"); 
  profileUser = null;
  removeProfileBox();
  loadImages();
};
tabTop.onclick = () => { 
  currentTab = "top"; 
  tabTop.classList.add("active"); 
  tabNew.classList.remove("active"); 
  profileUser = null;
  removeProfileBox();
  loadImages();
};

uploadBtn.onclick = async () => {
  uploadErr.textContent = "";
  uploadBtn.disabled = true;
  const file = uploadImg.files[0];
  if (!file) { uploadErr.textContent = "Please select an image!"; uploadBtn.disabled = false; return;}
  try {

    const snap = await db.collection("images")
      .where("username", "==", currentUser.username)
      .orderBy("created", "desc")
      .limit(1).get();
    if (!snap.empty) {
      const last = snap.docs[0].data();
      const diff = Date.now() - last.created;
      if (diff < 6*60*60*1000) {
        const remain = Math.ceil((6*60*60*1000-diff)/1000/60); 
        uploadErr.textContent = `You can only post every 6 hours. Please try again in ${remain} minutes!`;
        uploadBtn.disabled = false;
        return;
      }
    }
    const imgUrl = await uploadToCloudinary(file, "img");
    const imgId = "id_" + Math.random().toString(36).slice(2,9);
    await db.collection("images").doc(imgId).set({
      id: imgId,
      imgUrl,
      username: currentUser.username,
      avatar: currentUser.avatar,
      team: currentUser.team,
      proves: [],
      created: Date.now()
    });
    uploadImg.value = "";
    topBar.style.display = ""; topBar.innerHTML = "Image uploaded successfully!";
    setTimeout(()=>{ topBar.style.display="none";}, 1500);
    loadImages();
  } catch(err) {
    uploadErr.textContent = err + "";
  }
  uploadBtn.disabled = false;
}

async function loadImages() {
  if (profileUser) return; 
  let snap = await db.collection("images").get();
  let arr = snap.docs.map(d => d.data());
  renderImages(arr);
}

async function renderImages(images) {
  imagesBox.innerHTML = "";
  singleImageBox.style.display = "none";
  imagesBox.style.display = "";
  let arr = images.slice();
  if (currentTab === "top") arr.sort((a,b)=> (b.proves||[]).length-(a.proves||[]).length || b.created-a.created);
  else arr.sort((a,b)=>b.created-a.created);
  for (let img of arr) {
    imagesBox.appendChild(await renderImgCard(img));
  }
}


async function showProfile(username) {
  profileUser = username;
  removeProfileBox();
  singleImageBox.style.display = "none";
  imagesBox.style.display = "none";
  topBar.style.display = "none";
  
  const profileBox = document.createElement("div");
  profileBox.className = "profile-box";
  profileBox.id = "profileBox";
  profileBox.innerHTML = "<div class='profile-loading'>Loading...</div>";
  mainBox.appendChild(profileBox);

  try {
    const userDoc = await getUserByUsername(username);
    if (!userDoc) {
      profileBox.innerHTML = "<div class='profile-err'>User not found!</div>";
      return;
    }
    const user = userDoc.data();

    let images = [];
    try {
      const imgSnap = await db.collection("images")
        .where("username", "==", username)
        .orderBy("created", "desc")
        .get();
      images = imgSnap.docs.map(d=>d.data());
    } catch(e) {
      profileBox.innerHTML = `<div class='profile-err'>Error Database: ${e.message || e}</div>`;
      return;
    }

    profileBox.innerHTML = `
      <div class="profile-header">
        <img src="${user.avatar}" class="profile-avatar" />
        <div class="profile-name">${user.username}</div>
        <div class="profile-team" style="background: ${TEAM_COLORS[user.team]?.main||'#bbb'}">${TEAM_COLORS[user.team]?.name||user.team}</div>
        <div class="profile-img-count">Posted: ${images.length}</div>
        <button class="profile-back" type="button">Back</button>
      </div>
      <div class="profile-images images"></div>
    `;
    const imgBox = profileBox.querySelector(".profile-images");
    for (const img of images) {
      imgBox.appendChild(await renderImgCard(img));
    }
    profileBox.querySelector(".profile-back").onclick = ()=>{
      removeProfileBox();
      profileUser = null;
      loadImages();
    }
  } catch(e) {
    profileBox.innerHTML = `<div class='profile-err'>error: ${e.message || e}</div>`;
  }
}
function removeProfileBox() {
  const el = document.getElementById("profileBox");
  if (el) el.remove();
}


async function renderImgCard(img) {
  const card = document.createElement("div");
  card.className = "image-card";
  const borderColor = TEAM_COLORS[img.team]?.main||"#bbb";
  const proveCount = img.proves?.length || 0;
  card.innerHTML = `
    <img class="img" src="${img.imgUrl}" alt="">
    <div class="uinfo">
      <img src="${img.avatar}" class="avatar" style="border-color:${borderColor};cursor:pointer;">
      <span style="color:${borderColor};cursor:pointer;" class="username-link">${img.username}</span>
    </div>
    <div class="prove-box">
      <div style="display:flex;align-items:center;">
        <button class="prove-btn${img.proves && img.proves.includes(currentUser.username) ? " proved" : ""}" title="Prove">
          <img src="prove.webp" alt="Prove">
        </button>
        <span class="prove-count">${proveCount}</span>
      </div>
      <div class="share-link" title="Copy link">🔗 Share</div>
    </div>
  `;
  
  const proveBtn = card.querySelector(".prove-btn");
  proveBtn.onclick = async (e)=>{
    e.stopPropagation();
    let doc = await db.collection("images").doc(img.id).get();
    let proves = doc.data().proves||[];
    if (proves.includes(currentUser.username)) {
      proves = proves.filter(x=>x!==currentUser.username);
    } else {
      proves.push(currentUser.username);
    }
    await doc.ref.update({proves});
    if (profileUser) showProfile(profileUser); else loadImages();
  };
  
  card.querySelector(".share-link").onclick = (e)=>{
    e.stopPropagation();
    const url = location.origin + location.pathname + "#" + img.id;
    navigator.clipboard.writeText(url);
    topBar.style.display = ""; topBar.innerHTML = "Link copied!";
    setTimeout(()=>{topBar.style.display="none";}, 1200);
  };
  
  card.querySelector(".avatar").onclick = (e)=>{
    e.stopPropagation();
    showProfile(img.username);
  };
  card.querySelector(".username-link").onclick = (e)=>{
    e.stopPropagation();
    showProfile(img.username);
  };

  card.onclick = (e)=>{
    if (
      e.target.classList.contains("prove-btn") ||
      e.target.classList.contains("share-link") ||
      e.target.classList.contains("avatar") ||
      e.target.classList.contains("username-link") ||
      e.target.tagName==="IMG"
    ) return;
    showSingleImg(img.id);
  };
  return card;
}

async function showSingleImg(imgId) {
  let doc = await db.collection("images").doc(imgId).get();
  if (!doc.exists) { alert("Image not found!"); return;}
  let img = doc.data();
  singleImageBox.innerHTML = "";
  singleImageBox.style.display = "";
  imagesBox.style.display = "none";
  removeProfileBox();
  const card = await renderImgCard(img);
  singleImageBox.appendChild(card);
  window.scrollTo(0,0);
}

window.addEventListener("hashchange", ()=>{
  const h = location.hash.replace("#","");
  if (h.startsWith("id_")) showSingleImg(h);
  else {
    singleImageBox.style.display="none";
    imagesBox.style.display="";
    removeProfileBox();
    profileUser = null;
  }
});

window.onload = async ()=>{
  let user = loadUser();
  setTheme(loginTeam); 
  if (user) {
    currentUser = user;
    setTheme(user.team);
    onLoggedIn();
  }
  if (location.hash.startsWith("#id_")) setTimeout(()=>showSingleImg(location.hash.replace("#","")), 500);
};