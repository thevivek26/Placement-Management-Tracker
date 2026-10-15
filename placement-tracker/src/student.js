import { db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, doc, updateDoc, query, where, serverTimestamp
} from "firebase/firestore";

const MAX_ACTIVE_APPLICATIONS = 3;

export function initStudentDashboard() {
  loadDrives();
  loadMyApplications();
}

// ---------------------------------------------------------
// ELIGIBILITY CHECK
// ---------------------------------------------------------
function isEligible(student, drive) {
  const cgpaOk = student.cgpa >= drive.eligibility.minCgpa;
  const branchOk = drive.eligibility.branches.includes(student.branch);
  const backlogOk = student.backlogs <= drive.eligibility.maxBacklogs;
  return cgpaOk && branchOk && backlogOk;
}

function eligibilityReason(student, drive) {
  const reasons = [];
  if (student.cgpa < drive.eligibility.minCgpa) {
    reasons.push(`Requires CGPA ≥ ${drive.eligibility.minCgpa}, you have ${student.cgpa}`);
  }
  if (!drive.eligibility.branches.includes(student.branch)) {
    reasons.push(`Not open to ${student.branch} branch`);
  }
  if (student.backlogs > drive.eligibility.maxBacklogs) {
    reasons.push(`Allows max ${drive.eligibility.maxBacklogs} backlogs, you have ${student.backlogs}`);
  }
  return reasons.join(" · ");
}

// ---------------------------------------------------------
// LOAD + RENDER DRIVES
// ---------------------------------------------------------
async function loadDrives() {
  const listEl = document.getElementById("drives-list");
  listEl.innerHTML = "Loading...";

  const student = window.currentUserData;
  const snap = await getDocs(collection(db, "drives"));

  if (snap.empty) {
    listEl.innerHTML = "<p>No drives posted yet.</p>";
    return;
  }

  const appliedSnap = await getDocs(
    query(collection(db, "applications"), where("studentUid", "==", student.uid))
  );
  const myApplications = appliedSnap.docs.map(d => d.data());
  const appliedDriveIds = new Set(myApplications.map(a => a.driveId));
  const activeCount = myApplications.filter(a => a.status === "applied").length;
  const atCap = activeCount >= MAX_ACTIVE_APPLICATIONS;

  listEl.innerHTML = "";

  if (atCap) {
    const warning = document.createElement("p");
    warning.style.color = "#dc2626";
    warning.style.fontSize = "13px";
    warning.style.marginBottom = "10px";
    warning.textContent = `You have ${MAX_ACTIVE_APPLICATIONS} active applications (status still "applied"). Update their outcome below before applying to more drives.`;
    listEl.appendChild(warning);
  }

  snap.forEach(driveDoc => {
    const drive = driveDoc.data();
    const driveId = driveDoc.id;
    const eligible = isEligible(student, drive);
    const alreadyApplied = appliedDriveIds.has(driveId);
    const canApply = eligible && !alreadyApplied && !atCap;

    const card = document.createElement("div");
    card.style.border = "1px solid #e5e7eb";
    card.style.borderRadius = "8px";
    card.style.padding = "14px";
    card.style.marginBottom = "12px";
    card.style.opacity = eligible ? "1" : "0.55";

    let buttonLabel = "Apply";
    if (alreadyApplied) buttonLabel = "Already Applied";
    else if (atCap) buttonLabel = "Limit Reached";

    card.innerHTML = `
      <strong>${drive.companyName}</strong> — ${drive.role} (${drive.ctc} LPA)
      <span class="badge ${eligible ? "eligible" : "ineligible"}">${eligible ? "Eligible" : "Not Eligible"}</span>
      <br>
      <span style="font-size:13px; color:#6b7280;">
        Eligibility: CGPA ≥ ${drive.eligibility.minCgpa}, Backlogs ≤ ${drive.eligibility.maxBacklogs},
        Branches: ${drive.eligibility.branches.join(", ")}
      </span><br>
      <span style="font-size:13px; color:#6b7280;">Deadline: ${drive.applicationDeadline}</span><br>
      ${!eligible ? `<span style="font-size:12px; color:#dc2626;">${eligibilityReason(student, drive)}</span><br>` : ""}
      <button class="primary" style="width:auto; padding:6px 14px; margin-top:8px;" ${!canApply ? "disabled" : ""}>
        ${buttonLabel}
      </button>
    `;

    if (canApply) {
      card.querySelector("button").addEventListener("click", () => applyToDrive(driveId, drive));
    }

    listEl.appendChild(card);
  });
}

// ---------------------------------------------------------
// APPLY TO A DRIVE
// ---------------------------------------------------------
async function applyToDrive(driveId, drive) {
  const student = window.currentUserData;

  await addDoc(collection(db, "applications"), {
    driveId,
    studentUid: student.uid,
    studentName: student.name,
    studentEmail: student.email,
    studentBranch: student.branch,
    companyName: drive.companyName,
    ctc: drive.ctc,
    status: "applied",
    appliedAt: serverTimestamp()
  });

  loadDrives();
  loadMyApplications();
}

// ---------------------------------------------------------
// LOAD MY APPLICATIONS (with self-report status buttons)
// ---------------------------------------------------------
async function loadMyApplications() {
  const box = document.getElementById("my-applications");
  box.innerHTML = "Loading...";

  const student = window.currentUserData;
  const snap = await getDocs(
    query(collection(db, "applications"), where("studentUid", "==", student.uid))
  );

  if (snap.empty) {
    box.innerHTML = "<p>You haven't applied to any drives yet.</p>";
    return;
  }

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  table.innerHTML = `
    <tr style="text-align:left; font-size:13px; color:#6b7280;">
      <th>Company</th><th>CTC</th><th>Status</th><th>Update Outcome</th>
    </tr>
  `;

  snap.forEach(docSnap => {
    const app = docSnap.data();
    const appId = docSnap.id;

    const row = document.createElement("tr");
    row.style.fontSize = "14px";

    const actionsCell = app.status === "applied"
      ? `
        <button data-status="shortlisted" style="font-size:12px; padding:4px 8px; margin-right:4px;">Shortlisted</button>
        <button data-status="selected" style="font-size:12px; padding:4px 8px; margin-right:4px;">Selected</button>
        <button data-status="rejected" style="font-size:12px; padding:4px 8px;">Rejected</button>
      `
      : `<span style="font-size:12px; color:#6b7280;">Resolved</span>`;

    row.innerHTML = `
      <td>${app.companyName}</td>
      <td>${app.ctc} LPA</td>
      <td><span class="badge ${app.status}" id="status-${appId}">${app.status}</span></td>
      <td>${actionsCell}</td>
    `;

    row.querySelectorAll("button[data-status]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const newStatus = btn.getAttribute("data-status");
        await updateDoc(doc(db, "applications", appId), { status: newStatus });
        loadMyApplications();
        loadDrives();
      });
    });

    table.appendChild(row);
  });

  box.innerHTML = "";
  box.appendChild(table);
}