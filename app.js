(() => {
  const state = {
    hasPhoto: false,
    transcript: "",
    isRecording: false,
    isTranscribing: false,
    heardFromVoice: false,
  };

  let recognition = null;
  let previewUrl = null;
  let finalTranscript = "";

  const photoInput = document.getElementById("photo-input");
  const photoUpload = document.getElementById("photo-upload");
  const photoPreview = document.getElementById("photo-preview");
  const photoImg = document.getElementById("photo-img");
  const removePhotoBtn = document.getElementById("remove-photo");
  const language = document.getElementById("language");
  const micButton = document.getElementById("mic-button");
  const recordTitle = document.getElementById("record-title");
  const recordHint = document.getElementById("record-hint");
  const wave = document.getElementById("wave");
  const statusLoading = document.getElementById("status-loading");
  const statusSuccess = document.getElementById("status-success");
  const transcript = document.getElementById("transcript");
  const generateButton = document.getElementById("generate-button");
  const generateHint = document.getElementById("generate-hint");
  const listingCard = document.getElementById("listing-card");
  const listingTitle = document.getElementById("listing-title");
  const listingPrice = document.getElementById("listing-price");
  const listingTags = document.getElementById("listing-tags");
  const listingDesc = document.getElementById("listing-desc");
  const listingPhotoWrap = document.getElementById("listing-photo-wrap");
  const listingPhoto = document.getElementById("listing-photo");

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  function updateProgress() {
    setStep("photo", state.hasPhoto);
    setStep("voice", Boolean(state.transcript.trim()));
    setStep("listing", !listingCard.classList.contains("hidden"));
  }

  function setStep(name, active) {
    const step = document.getElementById(`step-${name}`);
    const circle = document.getElementById(`step-${name}-circle`);
    step.classList.toggle("active", active);

    if (name === "photo") circle.textContent = active ? "✓" : "1";
    else if (name === "voice") circle.textContent = active ? "✓" : "2";
    else circle.textContent = active ? "✓" : "3";
  }

  function updateGenerateEnabled() {
    const ready = state.hasPhoto && Boolean(state.transcript.trim());
    generateButton.disabled = !ready;
    generateHint.textContent = ready
      ? "Artisan AI will combine your photo and description into a listing."
      : "Add a photo and a short description to generate your listing.";
  }

  function hideListing() {
    listingCard.classList.add("hidden");
    updateProgress();
  }

  function setRecordingUi() {
    micButton.classList.toggle("recording", state.isRecording);
    micButton.textContent = state.isRecording ? "⏹" : "🎙️";
    micButton.disabled = state.isTranscribing;
    language.disabled = state.isRecording || state.isTranscribing;
    wave.classList.toggle("hidden", !state.isRecording);
    statusLoading.classList.toggle("hidden", !state.isTranscribing);

    if (state.isRecording) {
      recordTitle.textContent = "Listening...";
      recordHint.textContent = "Tap the microphone to stop";
    } else if (state.isTranscribing) {
      recordTitle.textContent = "Processing speech...";
      recordHint.textContent = "Hang tight for a moment";
    } else {
      recordTitle.textContent = "Tap to speak";
      recordHint.textContent = SpeechRecognition
        ? "Tell us about your product"
        : "Voice not supported here — type below instead";
    }
  }

  function applyTranscript(text, fromVoice) {
    state.transcript = text;
    transcript.value = text;
    if (fromVoice && text.trim()) {
      state.heardFromVoice = true;
      statusSuccess.classList.remove("hidden");
    }
    updateProgress();
    updateGenerateEnabled();
    hideListing();
  }

  photoUpload.addEventListener("click", () => photoInput.click());

  photoInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      photoInput.value = "";
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    photoImg.src = previewUrl;
    state.hasPhoto = true;
    photoUpload.classList.add("hidden");
    photoPreview.classList.remove("hidden");
    updateProgress();
    updateGenerateEnabled();
    hideListing();
  });

  removePhotoBtn.addEventListener("click", () => {
    state.hasPhoto = false;
    photoInput.value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    photoImg.removeAttribute("src");
    photoUpload.classList.remove("hidden");
    photoPreview.classList.add("hidden");
    updateProgress();
    updateGenerateEnabled();
    hideListing();
  });

  transcript.addEventListener("input", () => {
    state.transcript = transcript.value;
    if (!transcript.value.trim()) statusSuccess.classList.add("hidden");
    updateProgress();
    updateGenerateEnabled();
    hideListing();
  });

  function startRecording() {
    if (!SpeechRecognition) {
      alert(
        "Speech recognition is not supported in this browser. Please type your description in the box below (Chrome works best for voice)."
      );
      transcript.focus();
      return;
    }

    if (recognition) {
      try {
        recognition.abort();
      } catch (_) {
        /* ignore */
      }
    }

    finalTranscript = transcript.value.trim()
      ? `${transcript.value.trim()} `
      : "";

    recognition = new SpeechRecognition();
    recognition.lang = language.value || "hi-IN";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      state.isRecording = true;
      state.isTranscribing = false;
      statusSuccess.classList.add("hidden");
      setRecordingUi();
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += `${chunk} `;
        else interim += chunk;
      }
      const live = `${finalTranscript}${interim}`.trim();
      transcript.value = live;
      state.transcript = live;
      updateGenerateEnabled();
    };

    recognition.onerror = (event) => {
      const ignored = ["aborted", "no-speech"];
      if (ignored.includes(event.error)) return;

      state.isRecording = false;
      state.isTranscribing = false;
      setRecordingUi();

      if (event.error === "not-allowed") {
        alert(
          "Microphone permission was blocked. Allow mic access, or type your description instead."
        );
      } else {
        alert("Speech recognition failed. Please try again or type below.");
      }
    };

    recognition.onend = () => {
      const wasRecording = state.isRecording;
      state.isRecording = false;

      if (wasRecording) {
        state.isTranscribing = true;
        setRecordingUi();
        window.setTimeout(() => {
          state.isTranscribing = false;
          setRecordingUi();
          const text = (finalTranscript || transcript.value).trim();
          applyTranscript(text, Boolean(text));
          if (!text) {
            recordHint.textContent = "No speech captured — try again or type";
          }
        }, 350);
      } else {
        setRecordingUi();
      }
    };

    try {
      recognition.start();
    } catch (_) {
      alert("Could not start the microphone. Please try again.");
    }
  }

  function stopRecording() {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (_) {
      /* ignore */
    }
  }

  micButton.addEventListener("click", () => {
    if (state.isRecording) stopRecording();
    else startRecording();
  });

  function buildListing(text) {
    const clean = text.trim();
    const firstSentence = clean.split(/[.।!?]/)[0].trim();
    const title =
      firstSentence.length > 6
        ? firstSentence.slice(0, 64)
        : "Handmade Artisan Craft";

    const words = clean.toLowerCase();
    const tags = ["Handmade", "Artisan"];
    if (/diya|दीया|lamp|light|candle/.test(words)) tags.push("Festive");
    if (/pottery|मिट्टी|clay|ceramic|मटका/.test(words)) tags.push("Pottery");
    if (/silk|सिल्क|fabric|कपड़ा|textile|saree|साड़ी/.test(words))
      tags.push("Textile");
    if (/wood|लकड़ी|carved|bamboo/.test(words)) tags.push("Woodwork");
    if (/jewelry|jewellery|गहना|necklace|earring|ब्रेसलेट/.test(words))
      tags.push("Jewellery");

    let price = 499;
    if (clean.length > 80) price = 799;
    if (clean.length > 140) price = 1299;
    if (/silk|सिल्क|silver|चांदी|gold|सोना/.test(words)) price += 700;

    return {
      title,
      price: `₹${price.toLocaleString("en-IN")}`,
      tags: [...new Set(tags)].slice(0, 4),
      description: `${clean}\n\nCarefully crafted by a local artisan. Perfect for gifting or brightening your home. Each piece is unique.\n\n— Listing demo by student Pranjal Sharma`,
    };
  }

  generateButton.addEventListener("click", () => {
    if (!state.hasPhoto || !state.transcript.trim()) return;

    const listing = buildListing(state.transcript);
    listingTitle.textContent = listing.title;
    listingPrice.textContent = listing.price;
    listingDesc.textContent = listing.description;
    listingTags.innerHTML = "";
    listing.tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      listingTags.appendChild(chip);
    });

    if (previewUrl) {
      listingPhoto.src = previewUrl;
      listingPhotoWrap.classList.remove("hidden");
    } else {
      listingPhotoWrap.classList.add("hidden");
    }

    listingCard.classList.remove("hidden");
    updateProgress();
    listingCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  updateProgress();
  updateGenerateEnabled();
  setRecordingUi();
})();
