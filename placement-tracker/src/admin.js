import { db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, doc, updateDoc, query, where, serverTimestamp
} from "firebase/firestore";

export function initAdminDashboard() {
  setupDriveForm();
  loadDrives();
}

// ---------------------------------------------------------
// POST A NEW DRIVE
// ---------------------------------------------------------
function setupDriveForm() {
  const form = document.getElementById("drive-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById("drive-error");
    errorBox.textContent = "";

    const branchSelect = document.getElementById("drive-branches");
    const selectedBranches = Array.from(branchSelect.selectedOptions).map(o => o.value);

    if (selectedBranches.length === 0) {
      errorBox.textContent = "Select at least one eligible branch.";
      return;
    }

    const drive = {
      companyName: document.getElementById("drive-company").value.trim(),
      role: document.getElementById("drive-role").value.trim(),
      ctc: parseFloat(document.getElementById("drive-ctc").value),
      eligibility: {
        minCgpa: parseFloat(document.getElementById("drive-mincgpa").value),
        maxBacklogs: parseInt(document.getElementById("drive-maxbacklogs").value, 10),
        branches: selectedBranches
      },
      applicationDeadline: document.getElementById("drive-deadline").value,
      status: "open",
      createdBy: window.currentUserData.uid,
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, "drives"), drive);
      form.reset();
      loadDrives();
    } catch (err) {
      errorBox.textContent = err.message;
    }
  });
}

// ---------------------------------------------------------
// LOAD + RENDER DRIVES
// ---------------------------------------------------------
async function loadDrives() {
  const listEl = document.getElementById("drives-list");
  listEl.innerHTML = "Loading...";

  const snap = await getDocs(collection(db, "drives"));

  if (snap.empty) {
    listEl.innerHTML = "<p>No drives posted yet.</p>";
    return;
  }

  listEl.innerHTML = "";

  for (const driveDoc of snap.docs) {
    const drive = driveDoc.data();
    const driveId = driveDoc.id;

    const card = document.createElement("div");
    card.style.border = "1px solid #e5e7eb";
    card.style.borderRadius = "8px";
    card.style.padding = "14px";
    card.style.marginBottom = "12px";

    card.innerHTML = `
      <strong>${drive.companyName}</strong> — ${drive.role} (${drive.ctc} LPA)<br>
      <span style="font-size:13px; color:#6b7280;">
        Eligibility: CGPA ≥ ${drive.eligibility.minCgpa}, Backlogs ≤ ${drive.eligibility.maxBacklogs},
        Branches: ${drive.eligibility.branches.join(", ")}
      </span><br>
      <span style="font-size:13px; color:#6b7280;">Deadline: ${drive.applicationDeadline}</span><br>
      <button class="primary" style="width:auto; padding:6px 14px; margin-top:8px;" data-drive-id="${driveId}">
        View Applicants
      </button>
      <div class="applicants-box" id="applicants-${driveId}" style="margin-top:10px;"></div>
    `;

    card.querySelector("button").addEventListener("click", () => loadApplicants(driveId));
    listEl.appendChild(card);
  }
}

// ---------------------------------------------------------
// VIEW APPLICANTS FOR A DRIVE (with status-change controls)
// ---------------------------------------------------------
async function loadApplicants(driveId) {
  const box = document.getElementById(`applicants-${driveId}`);
  box.innerHTML = "Loading applicants...";

  const q = query(collection(db, "applications"), where("driveId", "==", driveId));
  const snap = await getDocs(q);

  if (snap.empty) {
    box.innerHTML = "<em>No applicants yet.</em>";
    return;
  }

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.marginTop = "6px";

  table.innerHTML = `
    <tr style="text-align:left; font-size:13px; color:#6b7280;">
      <th>Name</th><th>Email</th><th>Status</th><th>Actions</th>
    </tr>
  `;

  snap.forEach(docSnap => {
    const app = docSnap.data();
    const appId = docSnap.id;

    const row = document.createElement("tr");
    row.style.fontSize = "14px";
    row.innerHTML = `
      <td>${app.studentName || "—"}</td>
      <td>${app.studentEmail || "—"}</td>
      <td><span class="badge ${app.status}" id="status-${appId}">${app.status}</span></td>
      <td>
        <button data-status="shortlisted" style="font-size:12px; padding:4px 8px; margin-right:4px;">Shortlist</button>
        <button data-status="selected" style="font-size:12px; padding:4px 8px; margin-right:4px;">Select</button>
        <button data-status="rejected" style="font-size:12px; padding:4px 8px;">Reject</button>
      </td>
    `;

    row.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", async () => {
        const newStatus = btn.getAttribute("data-status");
        await updateDoc(doc(db, "applications", appId), { status: newStatus });
        const badge = document.getElementById(`status-${appId}`);
        badge.textContent = newStatus;
        badge.className = `badge ${newStatus}`;
      });
    });

    table.appendChild(row);
  });

  box.innerHTML = "";
  box.appendChild(table);
}