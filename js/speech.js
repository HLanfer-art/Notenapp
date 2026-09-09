/*
 * speech.js — Kapselt die Web Speech API (SpeechRecognition) für die
 * Mikrofon-Diktierfunktion. Unterstützt v. a. Chrome/Edge (Desktop) und
 * Chrome für Android; Safari (iPhone/iPad/Mac) hat keine funktionierende
 * Web-Speech-Erkennung — dort steht in der App automatisch die
 * Tastatur-Diktierfunktion der iOS/macOS-Tastatur (Mikrofon-Taste auf der
 * Bildschirmtastatur) als gleichwertiger Ersatz zur Verfügung, da der
 * Text ohnehin in ein normales Textfeld diktiert werden kann.
 */

const Speech = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;

  let recognition = null;
  let listening = false;
  let finalText = '';

  function isSupported() {
    return supported;
  }

  function isListening() {
    return listening;
  }

  function start({ onInterim, onFinalChunk, onEnd, onError } = {}) {
    if (!supported) return false;
    if (listening) return true;

    recognition = new SR();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += (finalText && !/\s$/.test(finalText) ? ' ' : '') + transcript.trim();
          if (onFinalChunk) onFinalChunk(finalText);
        } else {
          interim += transcript;
        }
      }
      if (onInterim) onInterim(interim);
    };

    recognition.onerror = (event) => {
      if (onError) onError(event.error);
    };

    recognition.onend = () => {
      listening = false;
      if (onEnd) onEnd(finalText);
    };

    finalText = '';
    listening = true;
    recognition.start();
    return true;
  }

  function stop() {
    if (recognition && listening) {
      recognition.stop();
    }
  }

  function reset() {
    finalText = '';
  }

  return { isSupported, isListening, start, stop, reset };
})();
