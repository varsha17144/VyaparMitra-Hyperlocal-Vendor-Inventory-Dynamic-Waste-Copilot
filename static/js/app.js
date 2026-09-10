// State management
let inventoryList = [];

// DOM Elements
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const previewContainer = document.getElementById("imagePreviewContainer");
const btnScan = document.getElementById("btnScan");
const btnLoadSample = document.getElementById("btnLoadSample");
const btnClearInventory = document.getElementById("btnClearInventory");
const inventoryBody = document.getElementById("inventoryBody");
const btnAdvisory = document.getElementById("btnAdvisory");
const advisorySection = document.getElementById("advisorySection");
const advisoryCards = document.getElementById("advisoryCards");
const scanStatus = document.getElementById("scanStatus");

// KPI Elements
const kpiSkus = document.getElementById("kpiSkus");
const kpiStock = document.getElementById("kpiStock");
const kpiValue = document.getElementById("kpiValue");
const kpiAtRisk = document.getElementById("kpiAtRisk");

// Image preview handler
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      imagePreview.src = event.target.result;
      previewContainer.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  }
});

// Scan Mandi Bill / Stock
btnScan.addEventListener("click", async () => {
  const file = imageInput.files[0];
  if (!file) return;

  btnScan.disabled = true;
  btnScan.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing with Gemini 1.5 Flash...`;
  scanStatus.innerText = "Analyzing bill text, items, and estimating produce shelf lives...";

  const formData = new FormData();
  formData.append("image", file);

  try {
    const res = await fetch("/api/scan-receipt", {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    if (result.status === "success" && Array.isArray(result.items)) {
      inventoryList = [...inventoryList, ...result.items];
      renderInventory();
      scanStatus.innerText = `Successfully extracted ${result.items.length} items (${result.source})!`;
    } else {
      alert("Could not extract items. Try another image.");
      scanStatus.innerText = "";
    }
  } catch (err) {
    console.error(err);
    alert("Error communicating with server.");
    scanStatus.innerText = "";
  } finally {
    btnScan.disabled = false;
    btnScan.innerHTML = `<i class="fa-solid fa-microchip"></i> Extract Inventory via Gemini Multimodal`;
  }
});

// Load quick sample for instant evaluation
btnLoadSample.addEventListener("click", () => {
  inventoryList = [
    { item_name: "Desi Tomatoes", quantity_kg: 30, cost_per_unit: 25, category: "vegetable", shelf_life_days: 1 },
    { item_name: "Red Onions", quantity_kg: 50, cost_per_unit: 28, category: "vegetable", shelf_life_days: 8 },
    { item_name: "Coriander / Cilantro Bundles", quantity_kg: 10, cost_per_unit: 15, category: "vegetable", shelf_life_days: 1 },
    { item_name: "Green Peas (Matar)", quantity_kg: 15, cost_per_unit: 60, category: "vegetable", shelf_life_days: 2 },
    { item_name: "Bananas (Robusta)", quantity_kg: 25, cost_per_unit: 30, category: "fruit", shelf_life_days: 2 }
  ];
  renderInventory();
  scanStatus.innerText = "Loaded 5 representative sample mandi items.";
});

// Clear table
btnClearInventory.addEventListener("click", () => {
  inventoryList = [];
  renderInventory();
  advisorySection.classList.add("hidden");
  scanStatus.innerText = "";
});

// Update KPI Stats & Render Table
function renderInventory() {
  if (inventoryList.length === 0) {
    inventoryBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-basket-shopping text-3xl mb-2 text-slate-300 block"></i>
          No items scanned yet. Upload a bill or click "Load Sample Bill" above!
        </td>
      </tr>
    `;
    kpiSkus.innerText = "0";
    kpiStock.innerText = "0";
    kpiValue.innerText = "₹0";
    kpiAtRisk.innerText = "0";
    return;
  }

  let totalKg = 0;
  let totalVal = 0;
  let atRiskCount = 0;

  inventoryBody.innerHTML = inventoryList.map((item) => {
    const shelf = Number(item.shelf_life_days) || 3;
    const kg = Number(item.quantity_kg) || 0;
    const cost = Number(item.cost_per_unit) || 0;

    totalKg += kg;
    totalVal += (kg * cost);

    const isUrgent = shelf <= 2;
    if (isUrgent) atRiskCount++;

    const statusBadge = isUrgent
      ? `<span class="bg-red-100 text-red-800 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><span class="w-1.5 h-1.5 rounded-full bg-red-600"></span>Expiring Soon (${shelf}d)</span>`
      : `<span class="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>Fresh (${shelf}d)</span>`;

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="px-4 py-3 font-semibold text-slate-800">${item.item_name}</td>
        <td class="px-4 py-3 capitalize text-slate-500">${item.category || "Produce"}</td>
        <td class="px-4 py-3 font-medium">${kg} kg</td>
        <td class="px-4 py-3 font-medium">₹${cost}/kg</td>
        <td class="px-4 py-3">${shelf} days</td>
        <td class="px-4 py-3">${statusBadge}</td>
      </tr>
    `;
  }).join("");

  kpiSkus.innerText = inventoryList.length;
  kpiStock.innerHTML = `${totalKg} <span class="text-xs text-slate-500 font-normal">kg</span>`;
  kpiValue.innerText = `₹${totalVal.toLocaleString('en-IN')}`;
  kpiAtRisk.innerHTML = `${atRiskCount} <span class="text-xs text-slate-500 font-normal">items</span>`;
}

// Evening Spoilage & Dynamic Pricing Advisory
btnAdvisory.addEventListener("click", async () => {
  if (inventoryList.length === 0) {
    alert("Please scan or load inventory items first!");
    return;
  }

  btnAdvisory.disabled = true;
  btnAdvisory.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Calculating dynamic discounts...`;

  try {
    const res = await fetch("/api/spoilage-advisory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventory: inventoryList })
    });
    const suggestions = await res.json();
    renderAdvisoryCards(suggestions);
  } catch (err) {
    console.error(err);
    alert("Failed to compute clearance advice.");
  } finally {
    btnAdvisory.disabled = false;
    btnAdvisory.innerHTML = `<i class="fa-solid fa-tags"></i> Generate Evening Discount Strategy`;
  }
});

function renderAdvisoryCards(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    alert("Great news! All current inventory has healthy shelf-life. No emergency markdowns needed.");
    return;
  }

  advisorySection.classList.remove("hidden");
  advisoryCards.innerHTML = suggestions.map((s) => `
    <div class="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <h3 class="font-bold text-slate-900 text-sm">${s.item_name}</h3>
          <span class="bg-amber-100 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full">
            ${s.discount_percent}% OFF
          </span>
        </div>
        <p class="text-xs text-slate-600 mb-2">${s.action}</p>
      </div>
      <div class="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100 mt-2">
        <p class="text-[11px] font-medium text-emerald-900">
          <i class="fa-solid fa-quote-left mr-1 text-emerald-500"></i>"${s.callout_pitch}"
        </p>
      </div>
    </div>
  `).join("");

  // Smooth scroll down to advisory
  advisorySection.scrollIntoView({ behavior: "smooth" });
}

// Browser Native Voice Recognition (Web Speech API)
const btnVoice = document.getElementById("btnVoice");
const voiceText = document.getElementById("voiceText");
const micIcon = document.getElementById("micIcon");

if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-IN";

  btnVoice.addEventListener("click", () => {
    try {
      recognition.start();
      voiceText.innerText = "Listening... Speak stall sale now";
      micIcon.classList.add("text-red-600", "animate-pulse");
    } catch (e) {
      console.log("Recognition already active");
    }
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    voiceText.innerText = `Recorded: "${transcript}"`;
    micIcon.classList.remove("text-red-600", "animate-pulse");

    // Extract basic keyword demo
    inventoryList.push({
      item_name: transcript.replace(/sold|added|kilo|kg/gi, "").trim() || "Spoken Produce Log",
      category: "vegetable",
      quantity_kg: 5,
      cost_per_unit: 30,
      shelf_life_days: 1
    });
    renderInventory();
  };

  recognition.onerror = () => {
    voiceText.innerText = "Voice input error. Click to retry.";
    micIcon.classList.remove("text-red-600", "animate-pulse");
  };

  recognition.onend = () => {
    micIcon.classList.remove("text-red-600", "animate-pulse");
  };
} else {
  btnVoice.disabled = true;
  voiceText.innerText = "Voice recognition not supported on this browser";
}
