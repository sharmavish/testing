(function () {
  var STORAGE_KEY = "listing-studio-products-v5";
  var state = { hasPhoto: false, transcript: "", isRecording: false };
  var listings = [];
  var recognition = null;
  var previewUrl = null;
  var finalTranscript = "";
  var photoDataUrl = "";

  var photoInput = document.getElementById("photo-input");
  var photoUpload = document.getElementById("photo-upload");
  var photoPreview = document.getElementById("photo-preview");
  var photoImg = document.getElementById("photo-img");
  var removePhoto = document.getElementById("remove-photo");
  var language = document.getElementById("language");
  var micButton = document.getElementById("mic-button");
  var recordHint = document.getElementById("record-hint");
  var transcript = document.getElementById("transcript");
  var priceInput = document.getElementById("price-input");
  var generateButton = document.getElementById("generate-button");
  var generateHint = document.getElementById("generate-hint");
  var clearInputs = document.getElementById("clear-inputs");
  var listingsStack = document.getElementById("listings-stack");
  var listingsEmpty = document.getElementById("listings-empty");
  var listingsCount = document.getElementById("listings-count");
  var deleteAllListings = document.getElementById("delete-all-listings");
  var downloadCsv = document.getElementById("download-csv");
  var downloadJson = document.getElementById("download-json");
  var sortSelect = document.getElementById("sort-select");
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function loadListings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      listings = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(listings)) listings = [];
    } catch (e) {
      listings = [];
    }
  }

  function saveListings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
    } catch (e) {}
  }

  function isValidPrice(value) {
    var n = Number(value);
    return Number.isFinite(n) && n >= 1;
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeCsv(value) {
    var s = String(value == null ? "" : value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function getPriceNumber(item) {
    if (typeof item.priceValue === "number") return item.priceValue;
    var n = Number(String(item.price || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function sortedListings() {
    var items = listings.slice();
    var mode = sortSelect.value;
    if (mode === "price-asc") {
      items.sort(function (a, b) {
        return getPriceNumber(a) - getPriceNumber(b);
      });
    } else if (mode === "price-desc") {
      items.sort(function (a, b) {
        return getPriceNumber(b) - getPriceNumber(a);
      });
    } else if (mode === "name") {
      items.sort(function (a, b) {
        return String(a.title || "").localeCompare(String(b.title || ""));
      });
    }
    return items;
  }

  function updateUI() {
    var priceOk = isValidPrice(priceInput.value);
    var ready = state.hasPhoto && !!state.transcript.trim() && priceOk;
    generateButton.disabled = !ready;
    if (!state.hasPhoto || !state.transcript.trim()) {
      generateHint.textContent = "Add a photo, description, and price to continue.";
    } else if (!priceOk) {
      generateHint.textContent = "Enter a valid price (required).";
    } else {
      generateHint.textContent = "Adds this product to your catalog.";
    }
    clearInputs.classList.toggle(
      "hidden",
      !state.hasPhoto &&
        !state.transcript.trim() &&
        !String(priceInput.value || "").trim()
    );
    renderListings();
  }

  function renderListings() {
    var items = sortedListings();
    var count = items.length;
    listingsCount.textContent =
      count === 0 ? "No products yet" : count === 1 ? "1 product" : count + " products";
    listingsEmpty.classList.toggle("hidden", count > 0);
    deleteAllListings.classList.toggle("hidden", count === 0);
    downloadCsv.classList.toggle("hidden", count === 0);
    downloadJson.classList.toggle("hidden", count === 0);
    listingsStack.innerHTML = "";

    items.forEach(function (item) {
      var title = String(item.title || "Product").trim();
      var desc = String(item.description || "").trim();
      var paragraphs = desc
        .split(/\n\n+/)
        .map(function (p) {
          return p.trim();
        })
        .filter(Boolean);
      if (paragraphs.length && normalizeText(paragraphs[0]) === normalizeText(title)) {
        paragraphs = paragraphs.slice(1);
      }
      desc = paragraphs.join(" ").trim();
      if (normalizeText(desc) === normalizeText(title)) desc = "";

      var card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        '<div class="card-media">' +
        (item.image
          ? '<img src="' + item.image + '" alt="' + escapeHtml(title) + '" />'
          : "") +
        "</div>" +
        '<div class="card-body">' +
        "<h3>" +
        escapeHtml(title) +
        "</h3>" +
        '<p class="card-price">' +
        escapeHtml(item.price || "") +
        "</p>" +
        (desc ? '<p class="card-desc">' + escapeHtml(desc) + "</p>" : "") +
        '<div class="card-actions">' +
        '<button class="btn btn-danger" type="button" data-delete="' +
        item.id +
        '">Delete</button>' +
        '<button class="btn btn-soft" type="button" data-download-one="' +
        item.id +
        '">Download</button>' +
        "</div></div>";
      listingsStack.appendChild(card);
    });
  }

  function clearPhoto() {
    state.hasPhoto = false;
    photoInput.value = "";
    photoDataUrl = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    photoImg.removeAttribute("src");
    photoUpload.classList.remove("hidden");
    photoPreview.classList.add("hidden");
  }

  function clearDescription() {
    state.transcript = "";
    transcript.value = "";
    finalTranscript = "";
  }

  function clearPrice() {
    priceInput.value = "";
  }

  function resetForm() {
    clearPhoto();
    clearDescription();
    clearPrice();
    updateUI();
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function buildListing(clean, image, priceValue) {
    var text = String(clean || "").trim();
    var parts = text.split(/[.?!]\s+|\u0964\s*/);
    var title = (parts[0] || "Product listing").trim().slice(0, 72);
    var rest = text.slice(title.length).replace(/^[\s.?!]+/, "").trim();
    var description = "";
    if (rest && normalizeText(rest) !== normalizeText(title)) description = rest;
    var amount = Math.round(Number(priceValue));
    return {
      id: "p-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      title: title || "Product listing",
      price: "\u20b9" + amount.toLocaleString("en-IN"),
      priceValue: amount,
      description: description,
      image: image || "",
      createdAt: Date.now(),
    };
  }

  function downloadBlob(filename, mime, content) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function listingsToCsv(items) {
    var rows = [["title", "price", "description"]];
    items.forEach(function (item) {
      rows.push([item.title || "", item.price || "", item.description || ""]);
    });
    return rows
      .map(function (row) {
        return row.map(escapeCsv).join(",");
      })
      .join("\n");
  }

  function setRecUI() {
    micButton.classList.toggle("rec", state.isRecording);
    language.disabled = state.isRecording;
    recordHint.textContent = state.isRecording
      ? "Listening... tap again to stop"
      : SR
        ? "Tap the microphone to describe your product"
        : "Voice unavailable — type instead";
  }

  photoUpload.onclick = function () {
    photoInput.click();
  };

  photoInput.onchange = async function () {
    var file = photoInput.files && photoInput.files[0];
    if (!file || file.type.indexOf("image/") !== 0) {
      alert("Please choose an image file.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    photoImg.src = previewUrl;
    try {
      photoDataUrl = await fileToDataUrl(file);
    } catch (e) {
      photoDataUrl = "";
    }
    state.hasPhoto = true;
    photoUpload.classList.add("hidden");
    photoPreview.classList.remove("hidden");
    updateUI();
  };

  removePhoto.onclick = function () {
    clearPhoto();
    updateUI();
  };
  clearInputs.onclick = function () {
    resetForm();
  };
  transcript.oninput = function () {
    state.transcript = transcript.value;
    updateUI();
  };
  priceInput.oninput = function () {
    updateUI();
  };
  sortSelect.onchange = function () {
    renderListings();
  };

  listingsStack.addEventListener("click", function (event) {
    var del = event.target.closest("[data-delete]");
    if (del) {
      var id = del.getAttribute("data-delete");
      listings = listings.filter(function (item) {
        return item.id !== id;
      });
      saveListings();
      updateUI();
      return;
    }
    var one = event.target.closest("[data-download-one]");
    if (one) {
      var item = listings.find(function (x) {
        return x.id === one.getAttribute("data-download-one");
      });
      if (!item) return;
      var payload = {
        title: item.title,
        price: item.price,
        description: item.description || "",
      };
      downloadBlob(
        (item.title || "product").replace(/[^\w\-]+/g, "_").slice(0, 40) + ".json",
        "application/json",
        JSON.stringify(payload, null, 2)
      );
    }
  });

  deleteAllListings.onclick = function () {
    if (!listings.length) return;
    if (!confirm("Delete all products?")) return;
    listings = [];
    saveListings();
    updateUI();
  };

  downloadCsv.onclick = function () {
    if (!listings.length) return;
    downloadBlob(
      "product-listings.csv",
      "text/csv;charset=utf-8",
      listingsToCsv(sortedListings())
    );
  };

  downloadJson.onclick = function () {
    if (!listings.length) return;
    var data = sortedListings().map(function (item) {
      return {
        title: item.title,
        price: item.price,
        description: item.description || "",
      };
    });
    downloadBlob(
      "product-listings.json",
      "application/json",
      JSON.stringify(data, null, 2)
    );
  };

  function startRec() {
    if (!SR) {
      alert("Speech recognition is not supported here. Please type instead.");
      transcript.focus();
      return;
    }
    if (recognition) {
      try {
        recognition.abort();
      } catch (e) {}
    }
    finalTranscript = transcript.value.trim() ? transcript.value.trim() + " " : "";
    recognition = new SR();
    recognition.lang = language.value || "hi-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onstart = function () {
      state.isRecording = true;
      setRecUI();
    };
    recognition.onresult = function (event) {
      var interim = "";
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += chunk + " ";
        else interim += chunk;
      }
      var live = (finalTranscript + interim).trim();
      transcript.value = live;
      state.transcript = live;
      updateUI();
    };
    recognition.onerror = function (event) {
      if (event.error === "aborted" || event.error === "no-speech") return;
      state.isRecording = false;
      setRecUI();
      alert(
        event.error === "not-allowed"
          ? "Microphone access was blocked."
          : "Speech recognition failed."
      );
    };
    recognition.onend = function () {
      state.isRecording = false;
      setRecUI();
      var text = (finalTranscript || transcript.value).trim();
      state.transcript = text;
      transcript.value = text;
      updateUI();
    };
    try {
      recognition.start();
    } catch (e) {
      alert("Could not start the microphone.");
    }
  }

  function stopRec() {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (e) {}
  }

  micButton.onclick = function () {
    if (state.isRecording) stopRec();
    else startRec();
  };

  generateButton.onclick = function () {
    if (!state.hasPhoto || !state.transcript.trim() || !isValidPrice(priceInput.value)) {
      generateHint.textContent = "Photo, description, and price are all required.";
      return;
    }
    listings.unshift(
      buildListing(
        state.transcript.trim(),
        photoDataUrl || photoImg.src || "",
        priceInput.value
      )
    );
    saveListings();
    resetForm();
    document
      .getElementById("listings-section")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  };

  loadListings();
  updateUI();
  setRecUI();
})();
