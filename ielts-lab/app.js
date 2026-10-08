// ==========================================
// 雅思官方听力真题 · 全能答案词听写系统
// 涵盖 4 大核心词书，共 2,092 核心答案词：
// 1. 📘 高频答案词 (985 词 · C1 考场真题 · 14 单元)
// 2. 📗 基础答案词 (597 词 · A1~B2 必修 · 10 单元)
// 3. 📕 进阶答案词 (197 词 · C1~C2 选修 · 4 单元)
// 4. 📙 短语答案词 (313 词 · 词组连读特训 · 6 单元)
//
// 核心架构：
// - 双播放引擎：长音频时间戳精准切音 (C1) + 独立单词高清 MP3 (基础/进阶/短语)
// - 全量 LocalStorage 持久化，随时刷新或关闭页面，进度与对错 100% 恢复
// - 跨单元、跨词书错题大汇总与一键攻坚模式
// ==========================================

class DictationApp {
  constructor() {
    this.booksData = window.BOOKS_DATA || {
      "all_words": {
        key: "all_words",
        title: "全核心单词总库",
        badge: "📘 1,612 词 · 23 组",
        desc: "历年雅思听力高频真题 + 基础必修 + 进阶拔高全单字深度去重融合，每组约70词阶梯精练",
        total_words: 1612,
        unit_count: 23,
        units: window.DICTATION_DATA || {}
      }
    };

    // 恢复历史词书 (优先默认切入全核心单词总库)
    const savedBook = localStorage.getItem("ielts_last_book");
    if (!savedBook || savedBook === "c1_high_frequency" || !this.booksData[savedBook]) {
      this.currentBookKey = "all_words";
    } else {
      this.currentBookKey = savedBook;
    }
    this.data = this.booksData[this.currentBookKey]?.units || window.DICTATION_DATA || {};

    // 恢复历史单元
    const savedUnit = localStorage.getItem(`ielts_last_unit_${this.currentBookKey}`) || (this.currentBookKey === "all_words" ? localStorage.getItem("ielts_c1_last_unit") : null);
    this.currentUnitKey = (savedUnit && this.data[savedUnit]) ? savedUnit : Object.keys(this.data)[0];

    this.currentMode = localStorage.getItem("ielts_c1_last_mode") || "practice";
    this.speed = parseFloat(localStorage.getItem("ielts_c1_last_speed") || "1.0");

    const savedInterval = localStorage.getItem("ielts_c1_last_interval") || "manual";
    this.isManualInterval = (savedInterval === "manual");
    this.intervalSeconds = this.isManualInterval ? 4.0 : parseFloat(savedInterval);

    this.words = [];
    this.currentIndex = 0;
    this.userAnswers = {}; // { index: { wordId, input, isCorrect, timestamp } }
    this.activeMistakeTab = "unit"; // "unit" | "global"
    this.isGlobalReview = false;
    this.mistakes = this.loadMistakes();

    this.isPlaying = false;
    this.isWaitingForAnswer = false;
    this.countdownTimer = null;
    this.advanceTimer = null;

    this.initDOMElements();
    this.initAudioPlayer();
    this.restoreUserPreferences();
    this.bindEvents();

    // 自动在后台将全库错题同步至本地服务端进行去重与预打包
    setTimeout(() => {
      try {
        const allM = this.getAllMistakes();
        if (allM && allM.length > 0) {
          fetch("/api/sync_and_build", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(allM)
          }).then(r => r.json()).then(data => {
            if (data && data.success) {
              console.log(`[AutoSync] 成功自动去重打包全库 ${data.total_raw} 错题 ➔ 保留 ${data.unique_count} 独立词 (剔除 ${data.duplicate_count} 重复词)`);
            }
          }).catch(() => {});
        }
      } catch (e) {
        console.warn("Auto-sync failed:", e);
      }
    }, 800);

    this.updateHeaderUI();
    this.populateUnits();
    this.loadUnit(this.currentUnitKey);
  }

  initDOMElements() {
    this.bookSelect = document.getElementById("book-select");
    this.unitSelect = document.getElementById("unit-select");
    this.speedSelect = document.getElementById("speed-select");
    this.intervalSelect = document.getElementById("interval-select");
    this.themeBtn = document.getElementById("theme-btn");
    this.modePills = document.querySelectorAll(".mode-pill");

    this.logoBadge = document.getElementById("logo-badge");
    this.logoTitle = document.getElementById("logo-title");
    this.logoSubtitle = document.getElementById("logo-subtitle");

    this.progressBar = document.getElementById("progress-bar");
    this.progressText = document.getElementById("progress-text");
    this.accuracyPreview = document.getElementById("accuracy-preview");
    this.btnResetUnit = document.getElementById("btn-reset-unit");

    this.questionGrid = document.getElementById("question-grid");
    this.gridStatusText = document.getElementById("grid-status-text");

    this.audioStatusText = document.getElementById("audio-status-text");
    this.pulseDot = document.querySelector(".pulse-dot");
    this.countdownContainer = document.getElementById("countdown-container");
    this.countdownBar = document.getElementById("countdown-bar");
    this.wordInput = document.getElementById("word-input");

    this.feedbackBox = document.getElementById("feedback-box");
    this.fbTargetWord = document.getElementById("fb-target-word");
    this.fbPhonetic = document.getElementById("fb-phonetic");
    this.fbMeaning = document.getElementById("fb-meaning");
    this.fbDiff = document.getElementById("fb-diff");

    this.btnReplay = document.getElementById("btn-replay");
    this.btnSubmit = document.getElementById("btn-submit");
    this.btnSkip = document.getElementById("btn-skip");
    this.btnPrev = document.getElementById("btn-prev");

    this.statTested = document.getElementById("stat-tested");
    this.statCorrect = document.getElementById("stat-correct");
    this.statWrong = document.getElementById("stat-wrong");
    this.statVerdict = document.getElementById("stat-verdict");

    this.tabUnitMistakes = document.getElementById("tab-unit-mistakes");
    this.tabGlobalMistakes = document.getElementById("tab-global-mistakes");
    this.mistakeCount = document.getElementById("mistake-count");
    this.globalMistakeCount = document.getElementById("global-mistake-count");
    this.mistakesSubtext = document.getElementById("mistakes-subtext");
    this.mistakeList = document.getElementById("mistake-list");
    this.btnRetryMistakes = document.getElementById("btn-retry-mistakes");
    this.btnRetryAllMistakes = document.getElementById("btn-retry-all-mistakes");
    this.btnExportAnki = document.getElementById("btn-export-anki");
    this.btnExportCsv = document.getElementById("btn-export-csv");
    this.btnSyncGlobalAnki = document.getElementById("btn-sync-global-anki");
  }

  initAudioPlayer() {
    this.audio = document.getElementById("audio-player");
    this.audio.addEventListener("timeupdate", () => this.handleAudioTimeUpdate());
    this.audio.addEventListener("ended", () => {
      this.handleWordAudioEnded();
    });
  }

  restoreUserPreferences() {
    // 恢复主题
    const savedTheme = localStorage.getItem("ielts_c1_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    if (this.themeBtn) {
      this.themeBtn.textContent = savedTheme === "light" ? "☀️" : "🌙";
    }

    // 恢复词书与语速
    if (this.bookSelect) {
      this.bookSelect.value = this.currentBookKey;
    }
    if (this.speedSelect) {
      const speedStr = (Math.abs(this.speed - 1.0) < 0.01) ? "1.0" : String(this.speed);
      this.speedSelect.value = speedStr;
    }
    this.intervalSelect.value = this.isManualInterval ? "manual" : String(this.intervalSeconds);

    this.modePills.forEach(p => {
      p.classList.toggle("active", p.dataset.mode === this.currentMode);
    });
  }

  bindEvents() {
    if (this.bookSelect) {
      this.bookSelect.addEventListener("change", (e) => {
        this.setBook(e.target.value);
      });
    }

    this.unitSelect.addEventListener("change", (e) => {
      if (e.target.value === "all_mistakes") {
        this.startGlobalReviewSession();
      } else {
        this.isGlobalReview = false;
        if (this.currentMode === "review") {
          this.currentMode = "practice";
          this.modePills.forEach(p => p.classList.toggle("active", p.dataset.mode === "practice"));
          localStorage.setItem("ielts_c1_last_mode", "practice");
        }
        this.loadUnit(e.target.value);
      }
    });

    this.speedSelect.addEventListener("change", (e) => {
      this.speed = parseFloat(e.target.value);
      this.audio.playbackRate = this.speed;
      localStorage.setItem("ielts_c1_last_speed", String(this.speed));
    });

    this.intervalSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "manual") {
        this.isManualInterval = true;
      } else {
        this.isManualInterval = false;
        this.intervalSeconds = parseFloat(val);
      }
      this.stopCountdown();
      localStorage.setItem("ielts_c1_last_interval", val);
    });

    this.modePills.forEach((pill) => {
      pill.addEventListener("click", () => {
        this.modePills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        this.setMode(pill.dataset.mode);
      });
    });

    this.themeBtn.addEventListener("click", () => this.toggleTheme());

    if (this.btnResetUnit) {
      this.btnResetUnit.addEventListener("click", () => this.resetCurrentUnit());
    }

    this.wordInput.addEventListener("keydown", (e) => this.handleInputKeydown(e));

    this.btnReplay.addEventListener("click", () => this.replayCurrentWord());
    this.btnSubmit.addEventListener("click", () => this.submitAnswer());
    this.btnSkip.addEventListener("click", () => this.skipCurrentWord());
    this.btnPrev.addEventListener("click", () => this.prevWord());

    if (this.tabUnitMistakes) {
      this.tabUnitMistakes.addEventListener("click", () => this.setMistakeTab("unit"));
    }
    if (this.tabGlobalMistakes) {
      this.tabGlobalMistakes.addEventListener("click", () => this.setMistakeTab("global"));
    }

    this.btnRetryMistakes.addEventListener("click", () => this.startReviewSession());
    if (this.btnRetryAllMistakes) {
      this.btnRetryAllMistakes.addEventListener("click", () => this.startGlobalReviewSession());
    }
    this.btnExportAnki.addEventListener("click", () => this.exportAnki());
    this.btnExportCsv.addEventListener("click", () => this.exportCsv());
    if (this.btnSyncGlobalAnki) {
      this.btnSyncGlobalAnki.addEventListener("click", () => this.syncAndBuildGlobalDeck());
    }
  }

  setBook(bookKey) {
    if (!this.booksData[bookKey]) return;
    this.stopAllTimers();
    this.isGlobalReview = false;
    this.currentBookKey = bookKey;
    localStorage.setItem("ielts_last_book", bookKey);
    this.data = this.booksData[bookKey].units;

    if (this.currentMode === "review") {
      this.currentMode = "practice";
      this.modePills.forEach(p => p.classList.toggle("active", p.dataset.mode === "practice"));
      localStorage.setItem("ielts_c1_last_mode", "practice");
    }

    const savedUnit = localStorage.getItem(`ielts_last_unit_${this.currentBookKey}`) || (this.currentBookKey === "c1_high_frequency" ? localStorage.getItem("ielts_c1_last_unit") : null);
    const unitKeys = Object.keys(this.data);
    this.currentUnitKey = (savedUnit && this.data[savedUnit]) ? savedUnit : unitKeys[0];

    this.updateHeaderUI();
    this.populateUnits();
    this.loadUnit(this.currentUnitKey);
  }

  getLang() {
    try {
      return localStorage.getItem("lang") || "en";
    } catch (e) {
      return "en";
    }
  }

  t(zh, en) {
    return this.getLang() === "zh" ? zh : en;
  }

  onLanguageChanged(lang) {
    this.populateUnits();
    this.updateProgress();
    this.updateStats();
    this.renderMistakes();
  }

  updateHeaderUI() {
    const book = this.booksData[this.currentBookKey];
    if (!book) return;
    if (this.logoBadge) {
      this.logoBadge.textContent = (this.currentBookKey === "all_words") ? "IELTS 核心" : ((this.currentBookKey === "c1_high_frequency") ? "IELTS C1" : book.title);
    }
    if (this.logoTitle) {
      this.logoTitle.textContent = `雅思听力真题 · ${book.title}听写系统`;
    }
    if (this.logoSubtitle) {
      this.logoSubtitle.textContent = `${book.total_words} 核心答案词 · ${book.desc}`;
    }
  }

  setMistakeTab(tab) {
    this.activeMistakeTab = tab;
    if (this.tabUnitMistakes) this.tabUnitMistakes.classList.toggle("active", tab === "unit");
    if (this.tabGlobalMistakes) this.tabGlobalMistakes.classList.toggle("active", tab === "global");
    if (this.mistakesSubtext) {
      this.mistakesSubtext.textContent = (tab === "global") 
        ? this.t("自动汇总全库4大词书所有错题与短语，支持一键跨库专项大冲关", "Aggregates mistakes across all 4 book sets for cross-unit mastery.")
        : this.t("自动记录当前单元/列表拼错或跳过的单词与短语，支持针对性循环重练", "Tracks mistakes and skipped words in this unit for focused revision.");
    }
    this.renderMistakes();
  }

  populateUnits() {
    this.unitSelect.innerHTML = "";

    // 专属全库错题大冲关选项
    const globalMistakes = this.getAllMistakes();
    if (globalMistakes.length > 0) {
      const optGlobal = document.createElement("option");
      optGlobal.value = "all_mistakes";
      optGlobal.textContent = this.t(
        `🎯 全库错题总库 (${globalMistakes.length} 词待攻坚)`,
        `🎯 Global Mistakes Pool (${globalMistakes.length} words to drill)`
      );
      optGlobal.style.fontWeight = "bold";
      optGlobal.style.color = "var(--accent)";
      this.unitSelect.appendChild(optGlobal);
    }

    const currentBookUnits = this.data || {};
    Object.keys(currentBookUnits).forEach((key) => {
      const u = currentBookUnits[key];
      const prog = this.loadUnitProgress(key);
      const opt = document.createElement("option");
      opt.value = key;

      if (prog && prog.userAnswers && Object.keys(prog.userAnswers).length > 0) {
        const answers = Object.values(prog.userAnswers);
        const correct = answers.filter(a => a.isCorrect).length;
        const rate = ((correct / answers.length) * 100).toFixed(0);
        opt.textContent = `${u.title} (${this.t('已练', 'Tested')} ${answers.length}/${u.word_count} · ${this.t('正确率', 'Accuracy')} ${rate}%)`;
      } else {
        opt.textContent = `${u.title} (${u.word_count} ${this.t('词 · 未开始', 'words · Not started')})`;
      }

      this.unitSelect.appendChild(opt);
    });

    this.unitSelect.value = this.isGlobalReview ? "all_mistakes" : this.currentUnitKey;
  }

  loadUnit(unitKey, customWords = null) {
    this.stopAllTimers();
    this.currentUnitKey = unitKey;
    localStorage.setItem(`ielts_last_unit_${this.currentBookKey}`, unitKey);
    if (this.currentBookKey === "c1_high_frequency") {
      localStorage.setItem("ielts_c1_last_unit", unitKey);
    }

    const unitData = this.data[unitKey];
    if (!unitData && !customWords) return;

    if (customWords) {
      // 错题攻坚模式
      this.words = customWords;
      this.currentIndex = 0;
      this.userAnswers = {};
    } else {
      // 正常单元练习：恢复历史进度
      this.words = unitData.words;
      const saved = this.loadUnitProgress(unitKey);
      if (saved && saved.userAnswers) {
        this.userAnswers = saved.userAnswers;
        if (saved.currentIndex !== undefined && saved.currentIndex < this.words.length) {
          this.currentIndex = saved.currentIndex;
        } else {
          const firstUnanswered = this.words.findIndex((_, idx) => !this.userAnswers[idx]);
          this.currentIndex = firstUnanswered !== -1 ? firstUnanswered : 0;
        }
      } else {
        this.userAnswers = {};
        this.currentIndex = 0;
      }
    }

    const activeWord = this.words[this.currentIndex];
    const targetAudioSrc = this.getAudioFileForWord(activeWord);
    const isNewAudio = (this.audio.getAttribute("src") !== targetAudioSrc);
    if (isNewAudio) {
      this.audio.src = targetAudioSrc;
      this.audio.load();
    }
    this.audio.playbackRate = this.speed;

    const preSeek = () => {
      const w = this.words[this.currentIndex];
      if (w && w.audio_start !== undefined && w.audio_end < 9000) {
        try {
          this.audio.currentTime = w.audio_start;
        } catch (e) {}
      }
    };
    if (this.audio.readyState >= 1) {
      preSeek();
    } else {
      this.audio.addEventListener("loadedmetadata", preSeek, { once: true });
    }

    this.renderQuestionGrid();
    this.updateProgress();
    this.updateStats();
    this.renderMistakes();

    if (this.currentBookKey === "all_words" || this.currentBookKey === "c1_high_frequency") {
      this.preloadAdjacentUnits();
    }

    const currentPrev = this.userAnswers[this.currentIndex];
    if (currentPrev) {
      this.wordInput.value = currentPrev.input === "[跳过]" ? "" : currentPrev.input;
      this.showFeedback(this.words[this.currentIndex], currentPrev.input, currentPrev.isCorrect);
    } else {
      this.resetFeedback();
      this.wordInput.value = "";
    }

    const answeredCount = Object.keys(this.userAnswers).length;
    const bookTitle = this.booksData[this.currentBookKey]?.title || '';
    const unitTitle = unitData?.title || '攻坚题目';
    if (answeredCount > 0 && !customWords) {
      this.updateAudioStatus(this.t(
        `已恢复【${bookTitle} · ${unitTitle}】进度（第 ${this.currentIndex + 1}/${this.words.length} 题），按空格播放`,
        `Resumed [${bookTitle} · ${unitTitle}] (Word ${this.currentIndex + 1}/${this.words.length}), press Space to play`
      ));
    } else {
      this.updateAudioStatus(this.t(
        `已加载【${bookTitle} · ${unitTitle}】，按空格键开始听音答题`,
        `Loaded [${bookTitle} · ${unitTitle}], press Space to play audio`
      ));
    }

    this.wordInput.focus();
  }

  setMode(mode) {
    this.currentMode = mode;
    localStorage.setItem("ielts_c1_last_mode", mode);
    this.stopAllTimers();

    if (mode === "review") {
      if (this.activeMistakeTab === "global" || this.isGlobalReview) {
        this.startGlobalReviewSession();
      } else {
        this.startReviewSession();
      }
    } else {
      if (mode === "timed") {
        this.isManualInterval = false;
      } else {
        this.isManualInterval = (this.intervalSelect.value === "manual");
      }
      this.loadUnit(this.currentUnitKey);
    }
  }

  startReviewSession() {
    const unitMistakes = this.getUnitMistakes();
    if (unitMistakes.length === 0) {
      const allMistakes = this.getAllMistakes();
      if (allMistakes.length > 0) {
        if (confirm(`当前单元暂无错词！但全库错题总库中共有 ${allMistakes.length} 个待攻坚词。\n\n是否立即开启【全库错题大冲关】？`)) {
          this.startGlobalReviewSession();
          return;
        }
      } else {
        alert("太棒了！当前单元暂无错词，请选择其他单元或进行听写测试！");
      }
      this.setMode("practice");
      return;
    }
    this.currentMode = "review";
    this.isGlobalReview = false;
    this.modePills.forEach(p => p.classList.toggle("active", p.dataset.mode === "review"));
    this.loadUnit(this.currentUnitKey, unitMistakes);
    this.updateAudioStatus(`🔥 已开启【本单元错题攻坚】，共 ${unitMistakes.length} 词`);
    this.playCurrentWord();
  }

  startGlobalReviewSession() {
    this.stopAllTimers();
    const allMistakes = this.getAllMistakes();
    if (allMistakes.length === 0) {
      alert("🎉 太棒了！全库暂无错词，全部通关！");
      this.isGlobalReview = false;
      this.setMode("practice");
      return;
    }

    this.currentMode = "review";
    this.isGlobalReview = true;
    this.modePills.forEach(p => p.classList.toggle("active", p.dataset.mode === "review"));

    this.words = allMistakes;
    this.currentIndex = 0;
    this.userAnswers = {};

    this.renderQuestionGrid();
    this.updateProgress();
    this.updateStats();
    this.renderMistakes();
    this.populateUnits();

    this.updateAudioStatus(`🎯 已加载【全库综合错题大冲关】共 ${allMistakes.length} 词，按空格播放`);
    this.playCurrentWord();
    this.wordInput.focus();
  }

  resetCurrentUnit() {
    if (this.isGlobalReview) {
      if (!confirm("确定要重新开始【全库错题大冲关】吗？")) {
        return;
      }
      this.stopAllTimers();
      this.userAnswers = {};
      this.currentIndex = 0;
      this.startGlobalReviewSession();
      return;
    }

    const unitTitle = this.data[this.currentUnitKey]?.title || "当前单元";
    const bookTitle = this.booksData[this.currentBookKey]?.title || '';
    if (!confirm(`确定要清空【${bookTitle} · ${unitTitle}】的所有作答记录并重新开始吗？`)) {
      return;
    }
    this.stopAllTimers();
    localStorage.removeItem(`ielts_progress_${this.currentBookKey}_${this.currentUnitKey}`);
    if (this.currentBookKey === "c1_high_frequency") {
      localStorage.removeItem(`ielts_c1_progress_${this.currentUnitKey}`);
    }
    this.userAnswers = {};
    this.currentIndex = 0;
    this.loadUnit(this.currentUnitKey);
    this.populateUnits();
  }

  preloadAdjacentUnits() {
    const unitKeys = Object.keys(this.data);
    const currIdx = unitKeys.indexOf(this.currentUnitKey);
    if (currIdx === -1) return;

    const targets = [];
    if (currIdx + 1 < unitKeys.length) targets.push(this.data[unitKeys[currIdx + 1]]?.audio_file);
    if (currIdx > 0) targets.push(this.data[unitKeys[currIdx - 1]]?.audio_file);

    targets.filter(Boolean).forEach(src => {
      if (src && src.endsWith(".m4a")) {
        const a = new Audio();
        a.preload = "auto";
        a.src = src;
      }
    });
  }

  getAudioFileForWord(word) {
    if (!word) return (this.data[this.currentUnitKey]?.audio_file || "./data/audio/unit_01.m4a").replace(/^\.\.\/data\//, "./data/");
    if (word.audio_file) {
      return word.audio_file.replace(/^\.\.\/data\//, "./data/");
    }
    const bKey = word.book || this.currentBookKey || "all_words";
    if (bKey === "all_words" || bKey === "c1_high_frequency") {
      const uNum = word.unit || 1;
      const uKey = `unit_${String(uNum).padStart(2, '0')}`;
      const src = this.booksData[bKey]?.units[uKey]?.audio_file || this.booksData["c1_high_frequency"]?.units[uKey]?.audio_file || `./data/audio/unit_${String(uNum).padStart(2, '0')}.m4a`;
      return src.replace(/^\.\.\/data\//, "./data/");
    }
    return word.audio_cdn || "";
  }

  // ==========================================
  // 音频与单词生命周期绝对对齐控制
  // ==========================================

  playCurrentWord() {
    if (!this.words.length || this.currentIndex >= this.words.length) return;
    const currentWord = this.words[this.currentIndex];

    this.stopAllTimers();
    this.audio.pause();
    this.updateActiveBadge();

    const targetAudioSrc = this.getAudioFileForWord(currentWord);
    const isIndividualAudio = !currentWord.audio_end || currentWord.audio_end > 9000;
    const targetTime = isIndividualAudio ? 0 : (currentWord.audio_start || 0);

    const executePlay = () => {
      try {
        this.audio.currentTime = targetTime;
      } catch (e) {
        console.warn("Audio seek error:", e);
      }
      this.audio.playbackRate = this.speed;
      this.isPlaying = true;
      this.isWaitingForAnswer = false;

      this.audio.play().then(() => {
        const bookInfo = this.booksData[currentWord.book || this.currentBookKey];
        const bookTag = (this.isGlobalReview && bookInfo) ? `[${bookInfo.title}] ` : '';
        const playMsg = this.t(
          `🎧 正在朗读: ${bookTag}第 ${this.currentIndex + 1} / ${this.words.length} 题`,
          `🎧 Playing: ${bookTag}Word ${this.currentIndex + 1} of ${this.words.length}`
        );
        this.updateAudioStatus(playMsg);
      }).catch(err => {
        console.warn("Audio play prevented:", err);
        const retryMsg = this.t(
          `点击任意处或按空格键播放第 ${this.currentIndex + 1} 题`,
          `Click anywhere or press Space to play Word ${this.currentIndex + 1}`
        );
        this.updateAudioStatus(retryMsg);
      });
    };

    // 跨音频源判定
    const currentSrc = this.audio.getAttribute("src") || "";
    const isDifferentFile = (currentSrc !== targetAudioSrc && !this.audio.src.endsWith(targetAudioSrc.replace("../", "")));
    if (isDifferentFile) {
      this.audio.src = targetAudioSrc;
      // CDN 自动容灾降级
      this.audio.onerror = () => {
        if (currentWord.audio_cdn && this.audio.src !== currentWord.audio_cdn) {
          console.warn("Audio local failed, falling back to CDN:", currentWord.audio_cdn);
          this.audio.src = currentWord.audio_cdn;
          this.audio.load();
        }
      };
      this.audio.load();
      const onReady = () => {
        this.audio.removeEventListener("loadedmetadata", onReady);
        this.audio.removeEventListener("canplay", onReady);
        executePlay();
      };
      this.audio.addEventListener("loadedmetadata", onReady, { once: true });
      this.audio.addEventListener("canplay", onReady, { once: true });
      return;
    }

    if (this.audio.readyState >= 1) {
      executePlay();
    } else {
      this.updateAudioStatus(`⏳ 音频缓冲中，请稍候...`);
      const onReady = () => {
        this.audio.removeEventListener("loadedmetadata", onReady);
        this.audio.removeEventListener("canplay", onReady);
        executePlay();
      };
      this.audio.addEventListener("loadedmetadata", onReady, { once: true });
      this.audio.addEventListener("canplay", onReady, { once: true });
    }
  }

  replayCurrentWord() {
    this.playCurrentWord();
    this.wordInput.focus();
  }

  handleWordAudioEnded() {
    this.audio.pause();
    this.isPlaying = false;
    this.isWaitingForAnswer = true;

    if (this.currentMode === "timed" || !this.isManualInterval) {
      this.startCountdown(this.intervalSeconds);
    } else {
      this.stopCountdown();
      this.updateAudioStatus(`第 ${this.currentIndex + 1} 题读毕，请拼写 (按 Enter 确认 / Space 重听)`);
    }
  }

  handleAudioTimeUpdate() {
    if (!this.isPlaying || !this.words.length) return;
    const currentWord = this.words[this.currentIndex];
    if (!currentWord) return;

    // 对于长音频分段切题 (C1)：
    if (currentWord.audio_end && currentWord.audio_end < 9000) {
      if (this.audio.currentTime < currentWord.audio_start - 0.25) {
        this.audio.currentTime = currentWord.audio_start;
        return;
      }
      const wordEndThreshold = currentWord.audio_end + 0.12;
      if (this.audio.currentTime >= wordEndThreshold) {
        this.handleWordAudioEnded();
      }
    }
  }

  startCountdown(seconds) {
    this.stopCountdown();
    this.countdownContainer.style.display = "block";
    this.countdownBar.style.width = "100%";

    const startTime = Date.now();
    const durationMs = seconds * 1000;

    this.countdownTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, durationMs - elapsed);
      const pct = (remaining / durationMs) * 100;
      this.countdownBar.style.width = `${pct}%`;

      if (remaining <= 0) {
        this.stopCountdown();
        this.submitAnswer(true);
      }
    }, 50);
  }

  stopCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.countdownContainer) {
      this.countdownContainer.style.display = "none";
    }
  }

  stopAllTimers() {
    this.stopCountdown();
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  handleInputKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      this.submitAnswer();
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.skipCurrentWord();
    } else if (e.key === " " && (e.ctrlKey || this.wordInput.value === "")) {
      e.preventDefault();
      this.replayCurrentWord();
    } else if (e.key === "ArrowLeft" && e.ctrlKey) {
      e.preventDefault();
      this.prevWord();
    } else if (e.key === "ArrowRight" && e.ctrlKey) {
      e.preventDefault();
      this.nextWord();
    }
  }

  cleanWord(str) {
    return (str || "").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
  }

  cleanNoSpace(str) {
    return (str || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  submitAnswer(isTimeout = false) {
    if (this.currentIndex >= this.words.length) return;
    this.stopAllTimers();

    const currentWord = this.words[this.currentIndex];
    const userInput = this.wordInput.value.trim();

    // 智能比对：支持单词与短语空格归一化比对，兼顾无空格容错
    const cleanUser = this.cleanWord(userInput);
    const cleanTarget = this.cleanWord(currentWord.word);
    let isMatch = (cleanUser === cleanTarget) || (this.cleanNoSpace(userInput) === this.cleanNoSpace(currentWord.word));

    // 雅思单复数兼容
    if (!isMatch && currentWord.notes && currentWord.notes.includes("的复数")) {
      const baseMatch = currentWord.notes.match(/^([a-zA-Z\-]+)的复数/);
      if (baseMatch && this.cleanNoSpace(userInput) === this.cleanNoSpace(baseMatch[1])) {
        isMatch = true;
      }
    }

    this.userAnswers[this.currentIndex] = {
      wordId: currentWord.id,
      input: userInput || (isTimeout ? "[超时未答]" : "[未填写]"),
      isCorrect: isMatch,
      timestamp: Date.now()
    };

    if (isMatch) {
      this.wordInput.classList.add("correct");
      this.removeMistake(currentWord.id);
    } else {
      this.wordInput.classList.add("incorrect");
      this.saveMistake(currentWord, userInput || "[空]");
    }

    this.saveUnitProgress();
    this.showFeedback(currentWord, userInput, isMatch);
    this.updateStats();
    this.renderMistakes();
    this.updateGridBadge(this.currentIndex, isMatch ? "correct" : "incorrect");

    const delay = isMatch ? 350 : 1200;

    this.advanceTimer = setTimeout(() => {
      this.wordInput.classList.remove("correct", "incorrect");
      this.wordInput.value = "";
      this.currentIndex++;

      if (this.currentIndex < this.words.length) {
        this.saveUnitProgress();
        this.updateProgress();
        this.playCurrentWord();
      } else {
        this.finishSession();
      }
    }, delay);
  }

  skipCurrentWord() {
    if (this.currentIndex >= this.words.length) return;
    this.stopAllTimers();

    const currentWord = this.words[this.currentIndex];

    this.userAnswers[this.currentIndex] = {
      wordId: currentWord.id,
      input: "[跳过]",
      isCorrect: false,
      timestamp: Date.now()
    };

    this.saveMistake(currentWord, "[跳过]");
    this.saveUnitProgress();

    this.showFeedback(currentWord, "[跳过]", false);
    this.updateStats();
    this.renderMistakes();
    this.updateGridBadge(this.currentIndex, "skipped");

    this.advanceTimer = setTimeout(() => {
      this.wordInput.value = "";
      this.currentIndex++;
      if (this.currentIndex < this.words.length) {
        this.saveUnitProgress();
        this.updateProgress();
        this.playCurrentWord();
      } else {
        this.finishSession();
      }
    }, 1200);
  }

  jumpToWord(targetIndex) {
    if (targetIndex < 0 || targetIndex >= this.words.length) return;
    this.stopAllTimers();
    this.currentIndex = targetIndex;
    this.saveUnitProgress();

    this.updateProgress();
    this.resetFeedback();

    const prevAnswer = this.userAnswers[this.currentIndex];
    if (prevAnswer) {
      this.wordInput.value = prevAnswer.input === "[跳过]" ? "" : prevAnswer.input;
      this.showFeedback(this.words[this.currentIndex], prevAnswer.input, prevAnswer.isCorrect);
    } else {
      this.wordInput.value = "";
    }

    this.playCurrentWord();
    this.wordInput.focus();
  }

  prevWord() {
    if (this.currentIndex > 0) {
      this.jumpToWord(this.currentIndex - 1);
    }
  }

  nextWord() {
    if (this.currentIndex < this.words.length - 1) {
      this.jumpToWord(this.currentIndex + 1);
    }
  }

  showFeedback(word, input, isCorrect) {
    const bookTitle = this.booksData[word.book]?.title || '';
    const unitTag = (this.isGlobalReview && word.unit) ? `[${bookTitle} U${word.unit}] ` : '';
    this.fbTargetWord.textContent = `${unitTag}${word.display_word || word.word}`;
    this.fbPhonetic.textContent = word.phonetic || "";
    this.fbMeaning.textContent = `${word.meaning} ${word.notes ? '(' + word.notes + ')' : ''}`;

    if (isCorrect) {
      this.fbDiff.innerHTML = `<span class="diff-correct">${this.t("✓ 拼写正确！", "✓ Correct spelling!")}</span>`;
    } else {
      this.fbDiff.innerHTML = this.computeDiffHTML(input, word.word);
    }
  }

  computeDiffHTML(userStr, targetStr) {
    const yourAns = this.t("你的作答", "Your input");
    const targetSpelling = this.t("正确拼写", "Target spelling");
    const blank = this.t("(空)", "(blank)");
    if (!userStr || userStr === "[跳过]" || userStr === "[超时未答]" || userStr === "[Skipped]" || userStr === "[Timed out]") {
      return `${yourAns}: <span class="diff-wrong">${userStr || blank}</span> ➔ ${targetSpelling}: <span class="diff-correct">${targetStr}</span>`;
    }
    return `${yourAns}: <span class="diff-wrong">${userStr}</span> ➔ ${targetSpelling}: <span class="diff-correct">${targetStr}</span>`;
  }

  resetFeedback() {
    this.fbTargetWord.textContent = "--";
    this.fbPhonetic.textContent = "";
    this.fbMeaning.textContent = this.t("戴好耳机听音拼写，按 Enter 校验", "Listen closely, type the word and press Enter to check");
    this.fbDiff.innerHTML = "";
  }

  finishSession() {
    this.stopAllTimers();
    this.audio.pause();
    this.isPlaying = false;
    this.updateAudioStatus(this.t("🎉 本组练习已完成！请查看成绩看板与错题本", "🎉 Unit completed! Review your scoreboard and mistake list"));
    this.updateProgress(100);

    const tested = Object.keys(this.userAnswers).length;
    const correct = Object.values(this.userAnswers).filter(a => a.isCorrect).length;
    const rate = tested > 0 ? ((correct / tested) * 100).toFixed(1) : 0;

    let verdict = rate >= 95 ? this.t("🌟 达标 (≥95%)", "🌟 Mastered (≥95%)") : this.t("❌ 未达标 (<95%)", "❌ Below Target (<95%)");
    const title = this.isGlobalReview 
      ? this.t("【全库错题大冲关完成】", "【Global Mistakes Drill Complete】") 
      : this.t("【听写单元完成】", "【Unit Dictation Complete】");
    const msg = this.t(
      `${title}\n已练词数: ${tested} / ${this.words.length}\n正确拼写: ${correct}\n最终正确率: ${rate}%\n判定结果: ${verdict}\n\n建议针对未完全掌握的词汇继续重练，直到 100% 全部拿下！`,
      `${title}\nWords tested: ${tested} / ${this.words.length}\nCorrect: ${correct}\nAccuracy: ${rate}%\nResult: ${verdict}\n\nKeep drilling unmastered words until 100% precision!`
    );
    alert(msg);
    this.renderMistakes();
    this.populateUnits();
  }

  updateProgress(overridePct = null) {
    const total = this.words.length;
    const current = Math.min(this.currentIndex + 1, total);
    const pct = overridePct !== null ? overridePct : (total > 0 ? (this.currentIndex / total) * 100 : 0);

    this.progressBar.style.width = `${pct}%`;
    const bookTitle = this.booksData[this.currentBookKey]?.title || '';
    const titleText = this.isGlobalReview ? this.t("🎯 全库错题总库", "🎯 Global Mistakes Pool") : `${bookTitle} · ${this.data[this.currentUnitKey]?.title || ''}`;
    this.progressText.textContent = this.t(
      `当前进度: 第 ${current} / ${total} 词 (${titleText})`,
      `Progress: Word ${current} of ${total} (${titleText})`
    );
    this.updateGridActiveBadge();
  }

  updateStats() {
    const answers = Object.values(this.userAnswers);
    const tested = answers.length;
    const correct = answers.filter(a => a.isCorrect).length;
    const wrong = answers.filter(a => !a.isCorrect).length;
    const rate = tested > 0 ? ((correct / tested) * 100).toFixed(1) : 0;

    this.statTested.textContent = tested;
    this.statCorrect.textContent = correct;
    this.statWrong.textContent = wrong;

    if (tested === 0) {
      this.statVerdict.textContent = this.t("待测试", "Pending");
      this.statVerdict.style.color = "var(--text-3)";
      this.accuracyPreview.textContent = this.t(`正确率: 0% (目标 95%+)`, `Accuracy: 0% (Target 95%+)`);
    } else {
      this.accuracyPreview.textContent = this.t(`正确率: ${rate}% (目标 95%+)`, `Accuracy: ${rate}% (Target 95%+)`);
      if (rate >= 95) {
        this.statVerdict.textContent = this.t(`🌟 达标 (${rate}%)`, `🌟 Mastered (${rate}%)`);
        this.statVerdict.style.color = "var(--success)";
      } else {
        this.statVerdict.textContent = this.t(`⚠️ 未达标 (${rate}%)`, `⚠️ Below Target (${rate}%)`);
        this.statVerdict.style.color = "var(--warning)";
      }
    }

    if (this.isGlobalReview) {
      this.gridStatusText.textContent = this.t(
        `🎯 错题攻坚：已练 ${tested} / ${this.words.length} 词`,
        `🎯 Mistake Drill: ${tested} / ${this.words.length} tested`
      );
    } else {
      this.gridStatusText.textContent = this.t(
        `已作答 ${tested} / ${this.words.length} 词`,
        `Answered ${tested} / ${this.words.length} words`
      );
    }
  }

  updateAudioStatus(text) {
    this.audioStatusText.textContent = text;
  }

  // ==========================================
  // 答题卡 (Question Grid) 渲染与状态更新
  // ==========================================

  renderQuestionGrid() {
    this.questionGrid.innerHTML = "";
    this.words.forEach((w, idx) => {
      const badge = document.createElement("div");
      badge.className = "grid-badge";
      badge.id = `grid-badge-${idx}`;
      badge.textContent = idx + 1;
      const bookTitle = this.booksData[w.book]?.title || '';
      const unitPrefix = (this.isGlobalReview && w.unit) ? `[${bookTitle} U${w.unit}] ` : '';
      badge.title = `${unitPrefix}第 ${idx + 1} 题: ${w.meaning || ''}`;

      const ans = this.userAnswers[idx];
      if (ans) {
        if (ans.isCorrect) badge.classList.add("correct");
        else if (ans.input === "[跳过]") badge.classList.add("skipped");
        else badge.classList.add("incorrect");
      }

      badge.addEventListener("click", () => {
        this.jumpToWord(idx);
      });

      this.questionGrid.appendChild(badge);
    });
    this.updateGridActiveBadge();
  }

  updateGridActiveBadge() {
    const allBadges = this.questionGrid.querySelectorAll(".grid-badge");
    allBadges.forEach((b, idx) => {
      b.classList.toggle("current", idx === this.currentIndex);
    });
  }

  updateGridBadge(index, status) {
    const badge = document.getElementById(`grid-badge-${index}`);
    if (badge) {
      badge.classList.remove("correct", "incorrect", "skipped");
      badge.classList.add(status);
    }
  }

  updateActiveBadge() {
    this.updateGridActiveBadge();
  }

  // ==========================================
  // 单元答题进度持久化 (LocalStorage)
  // ==========================================

  saveUnitProgress() {
    if (this.currentMode === "review") return;
    try {
      const payload = {
        currentIndex: this.currentIndex,
        userAnswers: this.userAnswers,
        updatedAt: Date.now()
      };
      const storageKey = `ielts_progress_${this.currentBookKey}_${this.currentUnitKey}`;
      localStorage.setItem(storageKey, JSON.stringify(payload));
      localStorage.setItem(`ielts_last_unit_${this.currentBookKey}`, this.currentUnitKey);
      if (this.currentBookKey === "c1_high_frequency") {
        localStorage.setItem(`ielts_c1_progress_${this.currentUnitKey}`, JSON.stringify(payload));
        localStorage.setItem("ielts_c1_last_unit", this.currentUnitKey);
      }
      this.populateUnits();
    } catch (e) {
      console.warn("Save progress error:", e);
    }
  }

  loadUnitProgress(unitKey, bookKey = null) {
    const bKey = bookKey || this.currentBookKey;
    try {
      const storageKey = `ielts_progress_${bKey}_${unitKey}`;
      let raw = localStorage.getItem(storageKey);
      if (!raw && (bKey === "c1_high_frequency" || bKey === "all_words")) {
        raw = localStorage.getItem(`ielts_progress_c1_high_frequency_${unitKey}`) || localStorage.getItem(`ielts_c1_progress_${unitKey}`);
      }
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ==========================================
  // 生词与错题持久化 (LocalStorage)
  // ==========================================

  getWordById(wordId) {
    if (!this.booksData) return null;
    for (const book of Object.values(this.booksData)) {
      if (book && book.units) {
        for (const u of Object.values(book.units)) {
          if (u && u.words) {
            const found = u.words.find(w => w.id === wordId);
            if (found) return found;
          }
        }
      }
    }
    return null;
  }

  loadMistakes() {
    try {
      const stored = localStorage.getItem("ielts_c1_mistakes");
      const mistakes = stored ? JSON.parse(stored) : {};
      if (this.booksData) {
        Object.values(mistakes).forEach(m => {
          if (m && m.word && m.word.id) {
            const latest = this.getWordById(m.word.id);
            if (latest) {
              m.word = latest;
              if (latest.book) m.book = latest.book;
            }
          }
        });
      }
      return mistakes;
    } catch {
      return {};
    }
  }

  saveMistake(word, input) {
    const bookKey = word.book || this.currentBookKey;
    const currentUnitNum = (this.isGlobalReview && word.unit) ? word.unit : (this.data[this.currentUnitKey]?.unit || word.unit || 1);
    const latestWord = this.getWordById(word.id) || word;
    latestWord.unit = currentUnitNum;
    latestWord.book = bookKey;
    const key = `w_${word.id}`;
    if (!this.mistakes[key]) {
      this.mistakes[key] = {
        book: bookKey,
        unit: currentUnitNum,
        word: latestWord,
        errorCount: 1,
        lastErrorInput: input,
        updatedAt: Date.now()
      };
    } else {
      this.mistakes[key].book = bookKey;
      this.mistakes[key].unit = currentUnitNum;
      this.mistakes[key].word = latestWord;
      this.mistakes[key].errorCount++;
      this.mistakes[key].lastErrorInput = input;
      this.mistakes[key].updatedAt = Date.now();
    }
    localStorage.setItem("ielts_c1_mistakes", JSON.stringify(this.mistakes));
  }

  removeMistake(wordId) {
    const key = `w_${wordId}`;
    if (this.mistakes[key]) {
      delete this.mistakes[key];
      localStorage.setItem("ielts_c1_mistakes", JSON.stringify(this.mistakes));
    }
  }

  getAllMistakes() {
    if (!this.booksData) return [];

    let hasNewSync = false;
    // 扫描全库4本词书的所有单元进度
    Object.keys(this.booksData).forEach(bKey => {
      const book = this.booksData[bKey];
      if (!book || !book.units) return;
      Object.keys(book.units).forEach(uKey => {
        const uData = book.units[uKey];
        if (!uData || !uData.words) return;
        const uNum = uData.unit;
        const prog = this.loadUnitProgress(uKey, bKey);
        if (prog && prog.userAnswers) {
          Object.entries(prog.userAnswers).forEach(([idx, ans]) => {
            if (!ans.isCorrect && uData.words[idx]) {
              const w = uData.words[idx];
              w.unit = uNum;
              w.book = bKey;
              const key = `w_${w.id}`;
              if (!this.mistakes[key]) {
                this.mistakes[key] = {
                  book: bKey,
                  unit: uNum,
                  word: w,
                  errorCount: 1,
                  lastErrorInput: ans.input || "[未填写]",
                  updatedAt: ans.timestamp || Date.now()
                };
                hasNewSync = true;
              }
            }
          });
        }
      });
    });

    // 实时作答记录同步
    if (this.currentUnitKey && this.userAnswers && !this.isGlobalReview) {
      const currU = this.data[this.currentUnitKey];
      const currNum = currU?.unit || 1;
      Object.entries(this.userAnswers).forEach(([idx, ans]) => {
        if (!ans.isCorrect && this.words && this.words[idx]) {
          const w = this.getWordById(this.words[idx].id) || this.words[idx];
          w.unit = currNum;
          w.book = this.currentBookKey;
          const key = `w_${w.id}`;
          if (!this.mistakes[key]) {
            this.mistakes[key] = {
              book: this.currentBookKey,
              unit: currNum,
              word: w,
              errorCount: 1,
              lastErrorInput: ans.input || "[未填写]",
              updatedAt: ans.timestamp || Date.now()
            };
            hasNewSync = true;
          }
        }
      });
    }

    if (hasNewSync) {
      try {
        localStorage.setItem("ielts_c1_mistakes", JSON.stringify(this.mistakes));
      } catch (e) {
        console.warn("Save mistakes sync error:", e);
      }
    }

    const list = Object.values(this.mistakes)
      .filter(m => m && m.word && m.word.id)
      .map(m => {
        const latest = this.getWordById(m.word.id);
        const w = latest ? { ...latest } : { ...m.word };
        w.unit = m.unit || w.unit || 1;
        w.book = m.book || w.book || "all_words";
        return w;
      });

    return list;
  }

  getUnitMistakes() {
    const currentUnit = this.data[this.currentUnitKey];
    const currentUnitNum = currentUnit?.unit || 1;
    const currentUnitWords = currentUnit?.words || [];
    const currentWordMap = new Map(currentUnitWords.map(w => [w.id, w]));
    const currentWordIds = new Set(currentWordMap.keys());

    let hasNewSync = false;
    if (!this.isGlobalReview) {
      Object.entries(this.userAnswers).forEach(([idx, ans]) => {
        if (!ans.isCorrect && this.words[idx]) {
          const w = currentWordMap.get(this.words[idx].id) || this.words[idx];
          w.unit = currentUnitNum;
          w.book = this.currentBookKey;
          const key = `w_${w.id}`;
          if (!this.mistakes[key]) {
            this.mistakes[key] = {
              book: this.currentBookKey,
              unit: currentUnitNum,
              word: w,
              errorCount: 1,
              lastErrorInput: ans.input || "[未填写]",
              updatedAt: ans.timestamp || Date.now()
            };
            hasNewSync = true;
          }
        }
      });
    }

    if (hasNewSync) {
      localStorage.setItem("ielts_c1_mistakes", JSON.stringify(this.mistakes));
    }

    return Object.values(this.mistakes)
      .filter(m => {
        if (!m || !m.word) return false;
        if (m.book && m.book !== this.currentBookKey) {
          if (this.currentBookKey === "all_words" && m.book === "c1_high_frequency") {
            // 允许继承之前 C1 的错题标记
          } else {
            return false;
          }
        }
        if (m.unit === currentUnitNum || m.word.unit === currentUnitNum) return true;
        return currentWordIds.has(m.word.id);
      })
      .map(m => currentWordMap.get(m.word.id) || this.getWordById(m.word.id) || m.word);
  }

  renderMistakes() {
    const unitMistakes = this.getUnitMistakes();
    const globalMistakes = this.getAllMistakes();

    if (this.mistakeCount) this.mistakeCount.textContent = unitMistakes.length;
    if (this.globalMistakeCount) this.globalMistakeCount.textContent = globalMistakes.length;

    const isGlobal = (this.activeMistakeTab === "global");
    const targetMistakes = isGlobal ? globalMistakes : unitMistakes;

    if (this.btnRetryMistakes) {
      this.btnRetryMistakes.style.display = (!isGlobal && unitMistakes.length > 0) ? "inline-flex" : "none";
    }
    if (this.btnRetryAllMistakes) {
      this.btnRetryAllMistakes.style.display = (globalMistakes.length > 0) ? "inline-flex" : "none";
    }

    if (targetMistakes.length === 0) {
      const emptyMsg = isGlobal
        ? this.t("🎉 太棒了！全库暂无错词，全部通关！", "🎉 Excellent! Zero mistakes in the entire corpus.")
        : this.t("暂无错词，加油保持全对！", "No mistakes yet! Keep up the perfect streak.");
      this.mistakeList.innerHTML = `<div style="color: var(--text-3); padding: 1.5rem; text-align: center; font-size: 0.9rem;">${emptyMsg}</div>`;
      return;
    }

    this.mistakeList.innerHTML = "";

    targetMistakes.forEach(w => {
      const mData = this.mistakes[`w_${w.id}`] || {};
      const yourAns = this.t("你的作答", "Your input");
      const lastInput = mData.lastErrorInput ? `<span style="font-size:0.8rem; color:var(--error); margin-left: 6px;">(${yourAns}: ${mData.lastErrorInput})</span>` : '';
      const bookTitle = this.booksData[w.book]?.title || '高频';
      const unitBadge = `<span class="unit-tag-badge">${bookTitle} U${w.unit || 1}</span>`;

      const item = document.createElement("div");
      item.className = "mistake-item";
      item.innerHTML = `
        <div class="mistake-word-info">
          <span class="mistake-word">
            ${unitBadge}
            ${w.display_word || w.word} 
            <span style="font-size:0.8rem; color:var(--accent); font-weight:normal; margin-left: 4px;">${w.phonetic || ''}</span>
            ${lastInput}
          </span>
          <span class="mistake-meaning">${w.meaning} ${w.notes ? '(' + w.notes + ')' : ''}</span>
        </div>
        <button class="btn" style="padding: 0.25rem 0.6rem; font-size: 0.8rem;" onclick="app.removeMistakeById(${w.id})">${this.t('已掌握 ✓', 'Mastered ✓')}</button>
      `;
      this.mistakeList.appendChild(item);
    });
  }

  removeMistakeById(id) {
    this.removeMistake(id);

    Object.keys(this.userAnswers).forEach(idx => {
      if (this.userAnswers[idx] && this.userAnswers[idx].wordId === id) {
        this.userAnswers[idx].isCorrect = true;
      }
    });

    Object.keys(this.booksData).forEach(bKey => {
      const book = this.booksData[bKey];
      if (!book || !book.units) return;
      Object.keys(book.units).forEach(uKey => {
        const prog = this.loadUnitProgress(uKey, bKey);
        if (prog && prog.userAnswers) {
          let modified = false;
          Object.values(prog.userAnswers).forEach(ans => {
            if (ans.wordId === id && !ans.isCorrect) {
              ans.isCorrect = true;
              modified = true;
            }
          });
          if (modified) {
            try {
              localStorage.setItem(`ielts_progress_${bKey}_${uKey}`, JSON.stringify(prog));
              if (bKey === "c1_high_frequency") {
                localStorage.setItem(`ielts_c1_progress_${uKey}`, JSON.stringify(prog));
              }
            } catch (e) {}
          }
        }
      });
    });

    if (!this.isGlobalReview) {
      this.saveUnitProgress();
    }
    this.updateStats();
    this.renderQuestionGrid();
    this.renderMistakes();
    this.populateUnits();
  }

  // ==========================================
  // 导出功能 (Anki & CSV)
  // ==========================================

  // ==========================================
  // 导出与一键查重打包功能 (Anki & CSV)
  // ==========================================

  async syncAndBuildGlobalDeck() {
    const allMistakes = this.getAllMistakes();
    if (!allMistakes || allMistakes.length === 0) {
      alert("当前全库暂无错题记录！");
      return;
    }

    if (this.btnSyncGlobalAnki) {
      this.btnSyncGlobalAnki.textContent = "⏳ 正在查重并打包音频...";
      this.btnSyncGlobalAnki.disabled = true;
    }

    try {
      const resp = await fetch("/api/sync_and_build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allMistakes)
      });
      const data = await resp.json();
      if (data.success) {
        let msg = `🎉 全库错题查重与打包全部完成！\n\n`;
        msg += `• 原始错题记录数: ${data.total_raw} 词\n`;
        msg += `• 发现并剔除重复词条: ${data.duplicate_count} 个 (有重复的已严格只保留1个)\n`;
        msg += `• 最终生成独立错题牌组: ${data.unique_count} 词\n\n`;
        if (data.duplicate_count > 0) {
          msg += `重复词条示例: ${data.duplicates.slice(0, 8).join(', ')}...\n\n`;
        }
        msg += `点击确定立即自动下载【IELTS_全库错题总库_去重纯音听写包.apkg】！`;
        alert(msg);

        // 自动触发下载
        const a = document.createElement("a");
        a.href = data.apkg_url;
        a.download = "IELTS_全库错题总库_去重纯音听写包.apkg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        alert("打包失败: " + (data.error || "未知错误"));
      }
    } catch (err) {
      alert("连接打包服务失败，正在以标准 TSV 方式导出去重版: " + err);
      this.exportAnki();
    } finally {
      if (this.btnSyncGlobalAnki) {
        this.btnSyncGlobalAnki.textContent = "⚡ 一键全库错题查重并打包 (.apkg)";
        this.btnSyncGlobalAnki.disabled = false;
      }
    }
  }

  exportAnki() {
    const isGlobal = (this.activeMistakeTab === "global");
    const targetWords = isGlobal ? this.getAllMistakes() : this.getUnitMistakes();
    const exportList = targetWords.length > 0 ? targetWords : this.words;

    // 严格按小写单词查重去重，重复项仅保留第一个
    const seenWords = new Set();
    const deduplicatedList = [];
    const duplicates = [];

    exportList.forEach(w => {
      const key = (w.word || '').trim().toLowerCase();
      if (!key) return;
      if (seenWords.has(key)) {
        duplicates.push(w.word);
      } else {
        seenWords.add(key);
        deduplicatedList.push(w);
      }
    });

    // Anki 官方标准纯盲听型 TSV 格式 (含音频、单词、音标、释义、考点笔记、标签)
    let tsv = "#separator:tab\n#html:true\n#tags column:6\n";
    tsv += "Audio\tWord\tPhonetic\tMeaning\tNotes\tTag\n";

    deduplicatedList.forEach(w => {
      const bookKey = w.book || this.currentBookKey;
      const bTitle = this.booksData[bookKey]?.title || '高频答案词';
      const tag = `IELTS::${bTitle}::Unit_${w.unit || 1}`;
      
      let audioSound = "";
      if (w.audio_file) {
        const baseName = w.audio_file.split("/").pop();
        audioSound = `[sound:${baseName}]`;
      } else {
        audioSound = `[sound:${w.word.toLowerCase().replace(/[^a-z0-9]/g, '_')}.mp3]`;
      }

      const cleanWord = (w.word || "").replace(/\t/g, " ");
      const cleanPhonetic = (w.phonetic || "").replace(/\t/g, " ");
      const cleanMeaning = (w.meaning || "").replace(/\t/g, " ");
      const cleanNotes = (w.notes || "").replace(/\t/g, " ");

      tsv += `${audioSound}\t${cleanWord}\t${cleanPhonetic}\t${cleanMeaning}\t${cleanNotes}\t${tag}\n`;
    });

    const bookTitle = this.booksData[this.currentBookKey]?.title || '雅思听力';
    const filename = isGlobal
      ? `IELTS_全库错题总库_已去重${deduplicatedList.length}词_听写卡_Anki.tsv`
      : `IELTS_${bookTitle}_${this.data[this.currentUnitKey]?.title}_已去重${deduplicatedList.length}词_听写卡_Anki.tsv`;

    this.downloadFile(tsv, filename, "text/tab-separated-values");
    if (duplicates.length > 0) {
      alert(`已成功导出 TSV！\n- 原始词条数: ${exportList.length}\n- 发现并剔除重复词条: ${duplicates.length} 个\n- 实际导出独立有效词: ${deduplicatedList.length} 词`);
    }
  }

  exportCsv() {
    const isGlobal = (this.activeMistakeTab === "global");
    const targetWords = isGlobal ? this.getAllMistakes() : this.getUnitMistakes();
    const exportList = targetWords.length > 0 ? targetWords : this.words;

    // 严格按小写单词查重去重
    const seenWords = new Set();
    const deduplicatedList = [];
    const duplicates = [];

    exportList.forEach(w => {
      const key = (w.word || '').trim().toLowerCase();
      if (!key) return;
      if (seenWords.has(key)) {
        duplicates.push(w.word);
      } else {
        seenWords.add(key);
        deduplicatedList.push(w);
      }
    });

    let csv = "ID,Book,Unit,单词短语,音标,中文释义,备注\n";
    deduplicatedList.forEach(w => {
      const bTitle = this.booksData[w.book || this.currentBookKey]?.title || '';
      csv += `"${w.id}","${bTitle}","${w.unit || 1}","${w.word}","${w.phonetic || ''}","${w.meaning}","${w.notes || ''}"\n`;
    });

    const bookTitle = this.booksData[this.currentBookKey]?.title || '雅思听力';
    const filename = isGlobal
      ? `IELTS_全库错题总库_已去重${deduplicatedList.length}词_Words.csv`
      : `IELTS_${bookTitle}_${this.data[this.currentUnitKey]?.title}_已去重${deduplicatedList.length}词_Words.csv`;

    this.downloadFile("\uFEFF" + csv, filename, "text/csv;charset=utf-8;");
    if (duplicates.length > 0) {
      alert(`已成功导出 CSV 清单！\n- 原始词条数: ${exportList.length}\n- 发现并剔除重复词条: ${duplicates.length} 个\n- 实际导出独立有效词: ${deduplicatedList.length} 词`);
    }
  }

  downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    this.themeBtn.textContent = next === "light" ? "☀️" : "🌙";
    localStorage.setItem("ielts_c1_theme", next);
  }
}

// Start app on DOM load
window.addEventListener("DOMContentLoaded", () => {
  window.app = new DictationApp();
});
