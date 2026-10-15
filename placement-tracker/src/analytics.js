import { db } from "./firebase-config.js";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

export async function initAnalytics() {
  const [usersSnap, applicationsSnap, drivesSnap] = await Promise.all([
    getDocs(query(collection(db, "users"), where("role", "==", "student"))),
    getDocs(collection(db, "applications")),
    getDocs(collection(db, "drives"))
  ]);

  const students = usersSnap.docs.map(d => d.data());
  const applications = applicationsSnap.docs.map(d => d.data());
  const drives = drivesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  renderBranchChart(students, applications);
  renderDriveChart(drives, applications);
  renderAveragePackage(applications);
}

// ---------------------------------------------------------
// PLACEMENT % BY BRANCH
// ---------------------------------------------------------
function renderBranchChart(students, applications) {
  const branchTotals = {};   // total students per branch
  const branchSelected = {}; // distinct selected students per branch

  students.forEach(s => {
    branchTotals[s.branch] = (branchTotals[s.branch] || 0) + 1;
  });

  const selectedUidsByBranch = {};
  applications
    .filter(a => a.status === "selected")
    .forEach(a => {
      const branch = a.studentBranch;
      if (!selectedUidsByBranch[branch]) selectedUidsByBranch[branch] = new Set();
      selectedUidsByBranch[branch].add(a.studentUid);
    });

  Object.keys(selectedUidsByBranch).forEach(branch => {
    branchSelected[branch] = selectedUidsByBranch[branch].size;
  });

  const branches = Object.keys(branchTotals);
  const percentages = branches.map(b => {
    const total = branchTotals[b] || 0;
    const selected = branchSelected[b] || 0;
    return total > 0 ? Math.round((selected / total) * 100) : 0;
  });

  new Chart(document.getElementById("branch-chart"), {
    type: "bar",
    data: {
      labels: branches,
      datasets: [{
        label: "Placement %",
        data: percentages,
        backgroundColor: "#2563eb"
      }]
    },
    options: {
      scales: { y: { beginAtZero: true, max: 100 } },
      plugins: { legend: { display: false } }
    }
  });
}

// ---------------------------------------------------------
// DRIVE-WISE APPLICATION STATS
// ---------------------------------------------------------
function renderDriveChart(drives, applications) {
  const labels = drives.map(d => d.companyName);

  const appliedCounts = drives.map(d =>
    applications.filter(a => a.driveId === d.id && a.status === "applied").length
  );
  const shortlistedCounts = drives.map(d =>
    applications.filter(a => a.driveId === d.id && a.status === "shortlisted").length
  );
  const selectedCounts = drives.map(d =>
    applications.filter(a => a.driveId === d.id && a.status === "selected").length
  );

  new Chart(document.getElementById("drive-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Applied", data: appliedCounts, backgroundColor: "#93c5fd" },
        { label: "Shortlisted", data: shortlistedCounts, backgroundColor: "#fde047" },
        { label: "Selected", data: selectedCounts, backgroundColor: "#86efac" }
      ]
    },
    options: {
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

// ---------------------------------------------------------
// AVERAGE PACKAGE (SELECTED STUDENTS ONLY)
// ---------------------------------------------------------
function renderAveragePackage(applications) {
  const selected = applications.filter(a => a.status === "selected");
  const el = document.getElementById("avg-package");

  if (selected.length === 0) {
    el.textContent = "No selections yet";
    return;
  }

  const avg = selected.reduce((sum, a) => sum + (a.ctc || 0), 0) / selected.length;
  el.textContent = `${avg.toFixed(2)} LPA`;
}