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
  var downloadPdf = document.getElementById("download-pdf");
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

  function safeFilename(name, fallback) {
    return String(name || fallback || "product")
      .replace(/[^\w\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || fallback || "product";
  }

  function imageFormat(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    if (dataUrl.indexOf("data:image/png") === 0) return "PNG";
    if (dataUrl.indexOf("data:image/jpeg") === 0 || dataUrl.indexOf("data:image/jpg") === 0)
      return "JPEG";
    if (dataUrl.indexOf("data:image/webp") === 0) return "WEBP";
    if (dataUrl.indexOf("data:image/") === 0) return "JPEG";
    return null;
  }

  function loadImageSize(src) {
    return new Promise(function (resolve) {
      if (!src) {
        resolve(null);
        return;
      }
      var img = new Image();
      img.onload = function () {
        resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = src;
    });
  }

  function getJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    return null;
  }

  async function buildPdf(items, options) {
    var JsPDF = getJsPdf();
    if (!JsPDF) {
      alert("PDF library failed to load. Refresh the page and try again.");
      return null;
    }

    var doc = new JsPDF({ unit: "mm", format: "a4" });
    var margin = 16;
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var contentW = pageW - margin * 2;
    var y = margin;
    var catalog = !options || !options.single;

    function ensureSpace(needed) {
      if (y + needed <= pageH - margin) return;
      doc.addPage();
      y = margin;
    }

    if (catalog) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(122, 31, 46);
      doc.text("Product listings", margin, y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text(
        items.length +
          (items.length === 1 ? " product" : " products") +
          "  |  Listing Studio  |  Pranjal Sharma",
        margin,
        y
      );
      doc.setTextColor(0, 0, 0);
      y += 6;
      doc.setDrawColor(200, 190, 180);
      doc.line(margin, y, pageW - margin, y);
      y += 10;
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var title = String(item.title || "Product").trim();
      var price = String(item.price || "").trim();
      var desc = String(item.description || "").trim();
      var imgSrc = item.image || "";
      var fmt = imageFormat(imgSrc);
      var size = fmt ? await loadImageSize(imgSrc) : null;
      var imgH = 0;
      var imgW = 0;

      if (size && size.w > 0 && size.h > 0) {
        imgW = Math.min(contentW, 90);
        imgH = (size.h / size.w) * imgW;
        if (imgH > 70) {
          imgH = 70;
          imgW = (size.w / size.h) * imgH;
        }
      }

      var titleLines = doc.splitTextToSize(title, contentW);
      var descLines = desc ? doc.splitTextToSize(desc, contentW) : [];
      var blockH =
        titleLines.length * 6 +
        7 +
        (descLines.length ? descLines.length * 5 + 2 : 0) +
        (imgH ? imgH + 6 : 0) +
        10;

      if (i > 0) ensureSpace(Math.min(blockH, 60));

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(20, 18, 26);
      ensureSpace(titleLines.length * 6 + 4);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 6 + 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(122, 31, 46);
      ensureSpace(8);
      doc.text(price || "Price not set", margin, y);
      y += 7;
      doc.setTextColor(0, 0, 0);

      if (imgH && fmt) {
        ensureSpace(imgH + 4);
        try {
          doc.addImage(imgSrc, fmt, margin, y, imgW, imgH);
          y += imgH + 5;
        } catch (e) {
          /* skip broken image */
        }
      }

      if (descLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        ensureSpace(descLines.length * 5 + 2);
        doc.text(descLines, margin, y);
        y += descLines.length * 5 + 4;
        doc.setTextColor(0, 0, 0);
      }

      if (catalog && i < items.length - 1) {
        y += 2;
        ensureSpace(8);
        doc.setDrawColor(220, 210, 200);
        doc.line(margin, y, pageW - margin, y);
        y += 8;
      }
    }

    return doc;
  }

  async function downloadListingsAsPdf(items, filename) {
    if (!items || !items.length) return;
    var doc = await buildPdf(items, { single: items.length === 1 });
    if (!doc) return;
    doc.save(filename);
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
    downloadPdf.classList.toggle("hidden", count === 0);
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
        '">Download PDF</button>' +
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
      downloadListingsAsPdf([item], safeFilename(item.title, "product") + ".pdf");
    }
  });

  deleteAllListings.onclick = function () {
    if (!listings.length) return;
    if (!confirm("Delete all products?")) return;
    listings = [];
    saveListings();
    updateUI();
  };

  downloadPdf.onclick = function () {
    if (!listings.length) return;
    downloadListingsAsPdf(sortedListings(), "product-listings.pdf");
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
