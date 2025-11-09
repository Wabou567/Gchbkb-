import React, { useState, useCallback, useRef, useEffect } from 'react';
import { generateSpeech, generateStory } from './services/geminiService';
import { VoiceOption } from './types';
import { LoadingSpinner } from './components/LoadingSpinner';
import { translations } from './translations';

// Audio decoding utilities
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// WAV file generation utilities
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function createWavBlob(pcmData: Int16Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = pcmData.length * 2;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(44 + i * 2, pcmData[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

type Mode = 'tts' | 'story';

function App() {
  const [text, setText] = useState<string>('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VoiceOption.NORA);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [mode, setMode] = useState<Mode>('tts');
  const [storyPrompt, setStoryPrompt] = useState<string>('');
  const [isStoryLoading, setIsStoryLoading] = useState<boolean>(false);
  const [storyError, setStoryError] = useState<string | null>(null);

  const t = useCallback((key: keyof typeof translations.ar) => {
    return translations[language][key] || key;
  }, [language]);
  
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);
  
  const handleGenerateStory = useCallback(async () => {
    if (!storyPrompt.trim()) {
        setStoryError(t('errorEnterPrompt'));
        return;
    }

    setIsStoryLoading(true);
    setStoryError(null);
    setError(null);

    try {
        const generatedStory = await generateStory(storyPrompt, language);
        setText(generatedStory);
        setMode('tts');
    } catch (e) {
        console.error(e);
        setStoryError(e instanceof Error ? `${t('errorPrefix')} ${e.message}` : t('errorGeneratingStory'));
    } finally {
        setIsStoryLoading(false);
    }
  }, [storyPrompt, language, t]);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      setError(t('errorEnterText'));
      return;
    }

    setIsLoading(true);
    setError(null);
    if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioBuffer(null);

    try {
      if (!audioContextRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const audioContext = audioContextRef.current;
      
      const base64Audio = await generateSpeech(text, selectedVoice);
      
      const audioBytes = decode(base64Audio);

      // Create WAV for download
      const dataInt16 = new Int16Array(audioBytes.buffer);
      const wavBlob = createWavBlob(dataInt16, 24000);
      const url = URL.createObjectURL(wavBlob);
      setAudioUrl(url);

      // Create AudioBuffer for playback
      const buffer = await decodeAudioData(audioBytes, audioContext, 24000, 1);
      setAudioBuffer(buffer);

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? `${t('errorPrefix')} ${e.message}` : t('errorUnknown'));
    } finally {
      setIsLoading(false);
    }
  }, [text, selectedVoice, t, audioUrl]);

  const handlePlay = useCallback(() => {
    if (!audioBuffer || !audioContextRef.current) return;

    const audioContext = audioContextRef.current;
     if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
  }, [audioBuffer]);

  return (
    <div className="bg-gray-900 min-h-screen flex items-center justify-center text-white p-4">
      <div className="w-full max-w-2xl bg-gray-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 transform transition-all hover:scale-[1.01] relative">
        
        <header className="text-center">
           <div className={`absolute top-6 ${language === 'ar' ? 'left-6' : 'right-6'}`}>
            <label htmlFor="lang-select" className="sr-only">{t('language')}</label>
            <select
              id="lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'ar' | 'en')}
              className="bg-gray-700 border border-gray-600 rounded-md py-1 px-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2">
            {t('title')}
          </h1>
        </header>
        
        <div className="flex border-b border-gray-700">
            <button
                onClick={() => setMode('tts')}
                className={`py-3 px-6 font-semibold transition-colors duration-200 ${
                mode === 'tts'
                    ? 'border-b-2 border-blue-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
            >
                {t('ttsTab')}
            </button>
            <button
                onClick={() => setMode('story')}
                className={`py-3 px-6 font-semibold transition-colors duration-200 ${
                mode === 'story'
                    ? 'border-b-2 border-blue-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
            >
                {t('storyGeneratorTab')}
            </button>
        </div>


        <main>
          {mode === 'story' && (
            <div className="space-y-4">
              <div>
                  <label htmlFor="story-prompt-input" className="block mb-2 text-sm font-medium text-gray-300">
                      {t('storyPromptLabel')}
                  </label>
                  <textarea
                      id="story-prompt-input"
                      rows={3}
                      className="w-full p-4 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200 text-white placeholder-gray-500"
                      placeholder={t('storyPromptPlaceholder')}
                      value={storyPrompt}
                      onChange={(e) => setStoryPrompt(e.target.value)}
                      disabled={isStoryLoading}
                  />
              </div>
              <button
                  onClick={handleGenerateStory}
                  disabled={isStoryLoading || !storyPrompt.trim()}
                  className="w-full flex justify-center items-center gap-3 bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 transform hover:-translate-y-1 disabled:transform-none"
              >
                  {isStoryLoading ? (
                      <>
                          <LoadingSpinner />
                          <span>{t('generatingStoryButton')}</span>
                      </>
                  ) : (
                      t('generateStoryButton')
                  )}
              </button>
              {storyError && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-center" role="alert">
                  <span className="block sm:inline">{storyError}</span>
                </div>
              )}
            </div>
          )}
          
          {mode === 'tts' && (
            <div className="space-y-6">
              <div>
                <label htmlFor="text-input" className="block mb-2 text-sm font-medium text-gray-300">
                  {t('textInputLabel')}
                </label>
                <textarea
                  id="text-input"
                  rows={5}
                  className="w-full p-4 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200 text-white placeholder-gray-500"
                  placeholder={t('textInputPlaceholder')}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="voice-select" className="block mb-2 text-sm font-medium text-gray-300">
                  {t('voiceSelectLabel')}
                </label>
                <select
                  id="voice-select"
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-200 text-white"
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value as VoiceOption)}
                  disabled={isLoading}
                >
                  {Object.values(VoiceOption).map((voice) => (
                    <option key={voice} value={voice}>
                      {t(`voice${voice}` as keyof typeof translations.ar)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      onClick={handleGenerate}
                      disabled={isLoading || !text.trim()}
                      className="w-full flex justify-center items-center gap-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 transform hover:-translate-y-1 disabled:transform-none"
                    >
                      {isLoading ? (
                        <>
                          <LoadingSpinner />
                          <span>{t('generatingButton')}</span>
                        </>
                      ) : (
                        t('generateAudioButton')
                      )}
                    </button>
                     <button
                      onClick={handlePlay}
                      disabled={isLoading || !audioBuffer}
                      className="w-full flex justify-center items-center gap-3 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-gray-500 focus:ring-opacity-50 transform hover:-translate-y-1 disabled:transform-none"
                    >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      {t('playAudioButton')}
                    </button>
                </div>
                
                {isLoading && (
                  <p className="text-center text-sm text-gray-400 animate-pulse">
                    {t('generatingMessage')}
                  </p>
                )}

                {audioUrl && !isLoading && (
                  <a
                    href={audioUrl}
                    download="gemini-speech.wav"
                    className="w-full flex justify-center items-center gap-3 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 transform hover:-translate-y-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    {t('downloadButton')}
                  </a>
                )}
              </div>

              {error && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-center" role="alert">
                  <span className="block sm:inline">{error}</span>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
