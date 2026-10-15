import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

// ---------------------------------------------------------
// SIGNUP
// ---------------------------------------------------------
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  const roleSelect = document.getElementById("signup-role");
  const studentFields = document.getElementById("student-fields");

  roleSelect.addEventListener("change", () => {
    studentFields.style.display = roleSelect.value === "student" ? "block" : "none";
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById("signup-error");
    errorBox.textContent = "";

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const role = roleSelect.value;

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      const userDoc = {
        name,
        email,
        role,
        createdAt: serverTimestamp()
      };

      if (role === "student") {
        userDoc.branch = document.getElementById("signup-branch").value;
        userDoc.cgpa = parseFloat(document.getElementById("signup-cgpa").value);
        userDoc.backlogs = parseInt(document.getElementById("signup-backlogs").value, 10);
      }

      await setDoc(doc(db, "users", uid), userDoc);

      window.location.href = role === "admin" ? "/admin/dashboard.html" : "/student/dashboard.html";
    } catch (err) {
      errorBox.textContent = err.message;
    }
  });
}

// ---------------------------------------------------------
// LOGIN
// ---------------------------------------------------------
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById("login-error");
    errorBox.textContent = "";

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const userSnap = await getDoc(doc(db, "users", cred.user.uid));

      if (!userSnap.exists()) {
        errorBox.textContent = "No profile found for this account. Contact admin.";
        return;
      }

      const role = userSnap.data().role;
      window.location.href = role === "admin" ? "/admin/dashboard.html" : "/student/dashboard.html";
    } catch (err) {
      errorBox.textContent = err.message;
    }
  });
}

// ---------------------------------------------------------
// ROUTE GUARD — call at top of any protected page
// ---------------------------------------------------------
export function guardRoute(requiredRole) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "/index.html";
      return;
    }
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists() || userSnap.data().role !== requiredRole) {
      await signOut(auth);
      window.location.href = "/index.html";
      return;
    }
    window.currentUserData = { uid: user.uid, ...userSnap.data() };
    document.dispatchEvent(new Event("userReady"));
  });
}

export function logout() {
  signOut(auth).then(() => {
    window.location.href = "/index.html";
  });
}

// Make logout available to inline onclick="logout()" in HTML
window.logout = logout;