(() => {
  const state = {
    hasPhoto: false,
    transcript: "",
    isRecording: false,
    isTranscribing: false,
  };

  let recognition = null;
  let previewUrl = null;

  const photoInput = document.getElementById("photo-input");
  const photoUpload = document.getElementById("photo-upload");
  const photoPreview = document.getElementById("photo-preview");
  const photoImg = document.getElementById("photo-img");
  const removePhoto = document.getElementById("remove-photo");
  const language = document.getElementById("language");
  const micButton = document.getElementById("mic-button");
  const recordTitle = document.getElementById("record-title");
  const recordHint = document.getElementById("record-hint");
  const wave = document.getElementById("wave");
  const statusLoading = document.getElementById("status-loading");
  const statusSuccess = document.getElementById("status-success");
  const transcriptCard = document.getElementById("transcript-card");
  const transcript = document.getElementById("transcript");
  const generateButton = document.getElementById("generate-button");
  const listingCard = document.getElementById("listing-card");
  const listingTitle = document.getElementById("listing-title");
  const listingPrice = document.getElementById("listing-price");
  const listingTags = document.getElementById("listing-tags");
  const listingDesc = document.getElementById("listing-desc");

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
    if (name === "listing" && active) {
      circle.textContent = "✓";
    } else if (name === "photo") {
      circle.textContent = active ? "✓" : "1";
    } else if (name === "voice") {
      circle.textContent = active ? "✓" : "2";
    } else {
      circle.textContent = "3";
    }
  }

  function updateGenerateEnabled() {
    generateButton.disabled = !state.hasPhoto && !state.transcript.trim();
  }

  function setRecordingUi() {
    micButton.classList.toggle("recording", state.isRecording);
    micButton.textContent = state.isRecording ? "⏹" : "🎙️";
    micButton.disabled = state.isTranscribing;
    language.disabled = state.isRecording || state.isTranscribing;
    wave.classList.toggle("hidden", !state.isRecording);

    if (state.isRecording) {
      recordTitle.textContent = "Listening...";
      recordHint.textContent = "Tap the microphone to stop";
    } else if (state.isTranscribing) {
      recordTitle.textContent = "AI is transcribing...";
      recordHint.textContent = "Hang tight for a moment";
    } else {
      recordTitle.textContent = "Tap to speak";
      recordHint.textContent = "Tell us about your product";
    }

    statusLoading.classList.toggle("hidden", !state.isTranscribing);
  }

  function showTranscript(text) {
    state.transcript = text;
    transcript.value = text;
    transcriptCard.classList.toggle("hidden", !text);
    statusSuccess.classList.toggle("hidden", !text);
    updateProgress();
    updateGenerateEnabled();
  }

  photoUpload.addEventListener("click", () => photoInput.click());

  photoInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    photoImg.src = previewUrl;
    state.hasPhoto = true;
    photoUpload.classList.add("hidden");
    photoPreview.classList.remove("hidden");
    updateProgress();
    updateGenerateEnabled();
  });

  removePhoto.addEventListener("click", () => {
    state.hasPhoto = false;
    photoInput.value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    photoImg.removeAttribute("src");
    photoUpload.classList.remove("hidden");
    photoPreview.classList.add("hidden");
    updateProgress();
    updateGenerateEnabled();
  });

  transcript.addEventListener("input", () => {
    state.transcript = transcript.value;
    updateProgress();
    updateGenerateEnabled();
  });

  function getSpeechLang() {
    const value = language.value;
    if (value === "en-IN") return "en-IN";
    return "hi-IN";
  }

  function startRecording() {
    if (!SpeechRecognition) {
      alert(
        "Speech recognition is not supported in this browser. Try Chrome, or type your description in the box after generating a sample."
      );
      showTranscript(
        "यह हाथ से बना मिट्टी का दीया है। त्योहारों के लिए बहुत सुंदर है।"
      );
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = getSpeechLang();
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      state.isRecording = true;
      state.isTranscribing = false;
      statusSuccess.classList.add("hidden");
      setRecordingUi();
    };

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();
      state.isTranscribing = true;
      setRecordingUi();
      setTimeout(() => {
        state.isTranscribing = false;
        setRecordingUi();
        showTranscript(text || "Could not catch that. Please try again.");
      }, 400);
    };

    recognition.onerror = () => {
      state.isRecording = false;
      state.isTranscribing = false;
      setRecordingUi();
      alert("Could not access the microphone or speech recognition failed.");
    };

    recognition.onend = () => {
      state.isRecording = false;
      setRecordingUi();
    };

    recognition.start();
  }

  function stopRecording() {
    if (recognition) recognition.stop();
  }

  micButton.addEventListener("click", () => {
    if (state.isRecording) stopRecording();
    else startRecording();
  });

  function buildListing(text) {
    const clean = text.trim() || "Handmade artisan craft made with care.";
    const firstSentence = clean.split(/[.।!?]/)[0].trim();
    const title =
      firstSentence.length > 8
        ? firstSentence.slice(0, 60)
        : "Handmade Artisan Craft";

    const words = clean.toLowerCase();
    const tags = ["Handmade", "Artisan"];
    if (/diya|दीया|lamp|light/.test(words)) tags.push("Festive");
    if (/pottery|मिट्टी|clay|ceramic/.test(words)) tags.push("Pottery");
    if (/silk|सिल्क|fabric|कपड़ा|textile/.test(words)) tags.push("Textile");
    if (/wood|लकड़ी|carved/.test(words)) tags.push("Woodwork");
    if (/jewelry|jewellery|गहना|necklace|earring/.test(words))
      tags.push("Jewellery");

    let price = 499;
    if (clean.length > 80) price = 799;
    if (clean.length > 140) price = 1299;
    if (/silk|सिल्क|silver|चांदी|gold|सोना/.test(words)) price += 700;

    return {
      title,
      price: `₹${price}`,
      tags: tags.slice(0, 4),
      description: `${clean}\n\nCarefully crafted by a local artisan. Perfect for gifting or brightening your home. Each piece is unique.`,
    };
  }

  generateButton.addEventListener("click", () => {
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
    listingCard.classList.remove("hidden");
    updateProgress();
    listingCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  updateProgress();
  updateGenerateEnabled();
  setRecordingUi();
})();
