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

  function getJsPdf() {
    if (window.jspdf && typeof window.jspdf.jsPDF === "function") {
      return window.jspdf.jsPDF;
    }
    if (typeof window.jsPDF === "function") return window.jsPDF;
    return null;
  }

  /** Convert any image data URL to JPEG for reliable PDF embedding + cover crop. */
  function prepareImageJpeg(src, sizePx) {
    return new Promise(function (resolve) {
      if (!src) {
        resolve(null);
        return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          var side = sizePx || 900;
          var canvas = document.createElement("canvas");
          canvas.width = side;
          canvas.height = side;
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#f3eee8";
          ctx.fillRect(0, 0, side, side);
          var iw = img.naturalWidth || img.width;
          var ih = img.naturalHeight || img.height;
          if (!iw || !ih) {
            resolve(null);
            return;
          }
          var scale = Math.max(side / iw, side / ih);
          var dw = iw * scale;
          var dh = ih * scale;
          var dx = (side - dw) / 2;
          var dy = (side - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = src;
    });
  }

  function cleanDesc(item) {
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
    return desc;
  }

  function drawHeaderBar(doc, pageW, title, subtitle) {
    doc.setFillColor(122, 31, 46);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, 16, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(255, 230, 230);
    doc.text(subtitle, 16, 20);
    doc.setTextColor(0, 0, 0);
  }

  function drawFooter(doc, pageW, pageH, pageNum, pageCount) {
    doc.setDrawColor(210, 200, 190);
    doc.setLineWidth(0.3);
    doc.line(16, pageH - 12, pageW - 16, pageH - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 115, 110);
    doc.text("Listing Studio  ·  Pranjal Sharma  ·  VIT-AP", 16, pageH - 6);
    doc.text(String(pageNum) + " / " + String(pageCount), pageW - 16, pageH - 6, {
      align: "right",
    });
    doc.setTextColor(0, 0, 0);
  }

  function drawProductCard(doc, item, jpeg, x, y, cardW, cardH, showDesc) {
    var pad = 4;
    var imgSide = cardW - pad * 2;
    var title = String(item.title || "Product").trim();
    var price = String(item.price || "").trim();
    var desc = cleanDesc(item);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(220, 210, 200);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, "FD");

    doc.setFillColor(243, 238, 232);
    doc.roundedRect(x + pad, y + pad, imgSide, imgSide, 2, 2, "F");

    if (jpeg) {
      try {
        doc.addImage(jpeg, "JPEG", x + pad, y + pad, imgSide, imgSide);
      } catch (e) {}
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(150, 140, 130);
      doc.text("No image", x + cardW / 2, y + pad + imgSide / 2, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }

    var textY = y + pad + imgSide + 7;
    var textW = cardW - pad * 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 18, 26);
    var titleLines = doc.splitTextToSize(title, textW).slice(0, 2);
    doc.text(titleLines, x + pad, textY);
    textY += titleLines.length * 4.5 + 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(122, 31, 46);
    doc.text(price || "-", x + pad, textY);
    textY += 6;

    if (showDesc && desc) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(90, 85, 80);
      var maxLines = Math.max(1, Math.floor((y + cardH - textY - 4) / 3.6));
      var descLines = doc.splitTextToSize(desc, textW).slice(0, maxLines);
      doc.text(descLines, x + pad, textY);
    }
    doc.setTextColor(0, 0, 0);
  }

  async function buildCatalogPdf(items) {
    var JsPDF = getJsPdf();
    if (!JsPDF) {
      alert("PDF library failed to load. Refresh the page and try again.");
      return null;
    }

    var prepared = [];
    for (var i = 0; i < items.length; i++) {
      prepared.push({
        item: items[i],
        jpeg: await prepareImageJpeg(items[i].image || "", 900),
      });
    }

    var doc = new JsPDF({ unit: "mm", format: "a4" });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 14;
    var gap = 8;
    var cols = 2;
    var cardW = (pageW - margin * 2 - gap) / cols;
    var cardH = 118;
    var top = 36;
    var bottom = 18;
    var rowsPerPage = Math.floor((pageH - top - bottom) / (cardH + gap));
    var perPage = cols * Math.max(1, rowsPerPage);
    var pageCount = Math.max(1, Math.ceil(prepared.length / perPage));

    for (var p = 0; p < pageCount; p++) {
      if (p > 0) doc.addPage();
      drawHeaderBar(
        doc,
        pageW,
        "Product listings",
        prepared.length +
          (prepared.length === 1 ? " product" : " products") +
          "  ·  Listing Studio catalog"
      );

      var start = p * perPage;
      var slice = prepared.slice(start, start + perPage);
      for (var j = 0; j < slice.length; j++) {
        var col = j % cols;
        var row = Math.floor(j / cols);
        var x = margin + col * (cardW + gap);
        var y = top + row * (cardH + gap);
        drawProductCard(doc, slice[j].item, slice[j].jpeg, x, y, cardW, cardH, true);
      }
      drawFooter(doc, pageW, pageH, p + 1, pageCount);
    }

    return doc;
  }

  async function buildSinglePdf(item) {
    var JsPDF = getJsPdf();
    if (!JsPDF) {
      alert("PDF library failed to load. Refresh the page and try again.");
      return null;
    }

    var jpeg = await prepareImageJpeg(item.image || "", 1200);
    var doc = new JsPDF({ unit: "mm", format: "a4" });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 18;
    var title = String(item.title || "Product").trim();
    var price = String(item.price || "").trim();
    var desc = cleanDesc(item);

    drawHeaderBar(doc, pageW, "Product sheet", "Listing Studio  ·  Pranjal Sharma");

    var imgSize = Math.min(pageW - margin * 2, 120);
    var imgX = (pageW - imgSize) / 2;
    var imgY = 40;

    doc.setFillColor(243, 238, 232);
    doc.roundedRect(imgX - 2, imgY - 2, imgSize + 4, imgSize + 4, 4, 4, "F");
    if (jpeg) {
      try {
        doc.addImage(jpeg, "JPEG", imgX, imgY, imgSize, imgSize);
      } catch (e) {}
    }

    var textY = imgY + imgSize + 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20, 18, 26);
    var titleLines = doc.splitTextToSize(title, pageW - margin * 2);
    doc.text(titleLines, pageW / 2, textY, { align: "center" });
    textY += titleLines.length * 8 + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(122, 31, 46);
    doc.text(price || "-", pageW / 2, textY, { align: "center" });
    textY += 12;

    if (desc) {
      doc.setDrawColor(220, 210, 200);
      doc.setLineWidth(0.3);
      doc.line(margin + 20, textY, pageW - margin - 20, textY);
      textY += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(70, 65, 60);
      var descLines = doc.splitTextToSize(desc, pageW - margin * 2 - 10);
      doc.text(descLines, pageW / 2, textY, { align: "center" });
    }

    drawFooter(doc, pageW, pageH, 1, 1);
    return doc;
  }

  async function downloadListingsAsPdf(items, filename, single) {
    if (!items || !items.length) return;
    var doc =
      single || items.length === 1
        ? await buildSinglePdf(items[0])
        : await buildCatalogPdf(items);
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
      downloadListingsAsPdf([item], safeFilename(item.title, "product") + ".pdf", true);
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
