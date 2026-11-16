import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  PhoneCall,
  Code2,
  Send,
  Copy,
  Check,
  Terminal,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { TelemetryData } from '../types/telemetry';
import { cabAudio } from '../utils/audio';
import {
  DEFAULT_EMERGENCY_PHONE_NUMBER,
  emergencyCallManager,
  EmergencyCallState,
  PlaceImmediateCallPayload,
} from '../utils/emergencyDialer';

interface HandsFreeVoiceAssistantCardProps {
  telemetry: TelemetryData;
  onVoiceCallTriggered?: (target: string, resolvedNumber: string) => void;
}

const SYSTEM_INSTRUCTIONS_TEXT = `You are a hands-free Android voice assistant. Your primary task is to help the user place immediate phone calls without requiring physical touch. 

When the user asks to call someone, you must immediately invoke the \`place_immediate_call\` tool. Do not ask for confirmation or add conversational filler. Extract the phone number or the contact name precisely. If the user provides a name instead of a number, pass the name to the function so the system can look it up in the address book.`;

const TOOL_JSON_SCHEMA = `{
  "name": "place_immediate_call",
  "description": "Triggers an instant, native Android phone call to a specific number or contact without requiring user confirmation.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "target": {
        "type": "STRING",
        "description": "The exact phone number (e.g., '+1234567890') or the name of the contact to call."
      }
    },
    "required": ["target"]
  }
}`;

export const HandsFreeVoiceAssistantCard: React.FC<HandsFreeVoiceAssistantCardProps> = ({
  telemetry,
  onVoiceCallTriggered,
}) => {
  const [callState, setCallState] = useState<EmergencyCallState>(emergencyCallManager.getState());
  const [voiceInput, setVoiceInput] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastSpokenCommand, setLastSpokenCommand] = useState<string>('');
  const [lastPayload, setLastPayload] = useState<PlaceImmediateCallPayload | null>(null);
  const [showSchemaDrawer, setShowSchemaDrawer] = useState<boolean>(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const unsub = emergencyCallManager.subscribe((state) => {
      setCallState(state);
      if (state.lastFunctionCall) {
        setLastPayload(state.lastFunctionCall);
      }
    });
    return () => unsub();
  }, []);

  const activePhone = callState.phoneNumber || DEFAULT_EMERGENCY_PHONE_NUMBER;

  const executeVoiceCallCommand = async (commandText: string) => {
    const trimmed = commandText.trim() || `Call ${activePhone} immediately.`;
    setLastSpokenCommand(trimmed);
    setIsProcessing(true);
    cabAudio.playKeyClick();

    const payload = await emergencyCallManager.executeVoiceCommandCall(trimmed, {
      unitNumber: telemetry.selectedVehicle?.unitNumber || telemetry.cabUnitId,
      latitude: telemetry.gps.latitude,
      longitude: telemetry.gps.longitude,
      reason: 'DIRECT',
    });

    setLastPayload(payload);
    setIsProcessing(false);

    if (onVoiceCallTriggered) {
      const target = payload.functionCall?.args?.target || activePhone;
      const resolved = payload.resolvedPhoneNumber || target;
      onVoiceCallTriggered(target, resolved);
    }
  };

  const toggleVoiceRecognition = () => {
    cabAudio.playKeyClick();
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
      return;
    }

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      // If browser SpeechRecognition is unavailable, execute immediate voice call to configured number
      executeVoiceCallCommand(`Call ${activePhone} immediately.`);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        setIsListening(false);
        if (transcript) {
          setVoiceInput(transcript);
          executeVoiceCallCommand(transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setIsListening(false);
      executeVoiceCallCommand(`Call ${activePhone} immediately.`);
    }
  };

  const handleCopy = (key: string, text: string) => {
    cabAudio.playKeyClick();
    navigator.clipboard.writeText(text);
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const displayFunctionCallJson = JSON.stringify(
    lastPayload
      ? { functionCall: lastPayload.functionCall }
      : {
          functionCall: {
            name: 'place_immediate_call',
            args: {
              target: activePhone,
            },
          },
        },
    null,
    2
  );

  const resolvedDialTarget =
    lastPayload?.resolvedPhoneNumber || lastPayload?.functionCall?.args?.target || activePhone;

  return (
    <div className="bg-[#111927] border-2 border-[#38bdf8]/50 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-lg">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#30363d] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#38bdf8]/20 border border-[#38bdf8] text-[#38bdf8] flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-headline font-bold text-white text-sm sm:text-base">
                Hands-Free Android Voice Call Assistant
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40 font-bold">
                TOOL: place_immediate_call
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#94a3b8]">
              Zero-touch voice command &rarr; Gemini Function Call &rarr; Instant 0ms Android Call
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            cabAudio.playKeyClick();
            setShowSchemaDrawer(!showSchemaDrawer);
          }}
          className="px-3 py-1.5 rounded-lg bg-[#1c2b3c] hover:bg-[#273647] text-[#38bdf8] border border-[#38bdf8]/40 font-mono text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>PROMPT &amp; JSON SCHEMA</span>
          {showSchemaDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Voice Command Input & Mic Trigger Row */}
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        <button
          type="button"
          onClick={toggleVoiceRecognition}
          className={`min-h-[46px] px-4 py-2 rounded-xl font-headline font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 ${
            isListening
              ? 'bg-[#ef4444] text-white border-2 border-white animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.6)]'
              : 'bg-[#38bdf8] hover:bg-[#0284c7] text-[#051424] shadow-md'
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="w-4 h-4 animate-bounce" />
              <span>LISTENING... SPEAK NOW</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span>SPEAK VOICE COMMAND</span>
            </>
          )}
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeVoiceCallCommand(voiceInput || `Call ${activePhone} immediately.`);
          }}
          className="flex-1 flex items-center gap-2"
        >
          <input
            type="text"
            value={voiceInput}
            onChange={(e) => setVoiceInput(e.target.value)}
            placeholder={`Say or type: "Call ${activePhone} immediately." or "Call Dispatch"`}
            className="flex-1 min-h-[46px] px-3.5 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-white font-mono text-xs sm:text-sm focus:outline-none focus:border-[#38bdf8]"
          />
          <button
            type="submit"
            disabled={isProcessing}
            className="min-h-[46px] px-4 py-2 rounded-xl bg-[#10b981] hover:bg-[#059669] text-black font-headline font-extrabold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>{isProcessing ? 'CALLING...' : 'RUN AI CALL'}</span>
          </button>
        </form>
      </div>

      {/* 1-Tap Quick Voice Command Chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-mono text-[#94a3b8] uppercase mr-1">
          1-TAP VOICE COMMANDS:
        </span>
        {[
          `Call ${activePhone} immediately.`,
          'Call 555-0199 immediately.',
          'Call Emergency Dispatch',
          'Call Ambulance',
        ].map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => {
              setVoiceInput(sample);
              executeVoiceCallCommand(sample);
            }}
            className="px-2.5 py-1 rounded-lg bg-[#1c2b3c] hover:bg-[#273647] text-[#d4e4fa] border border-[#30363d] font-mono text-[11px] cursor-pointer active:scale-95 transition-transform"
          >
            "{sample}"
          </button>
        ))}
      </div>

      {/* Live Structured FunctionCall Output & Executed Android Intent */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
        {/* Left: Structured JSON Output from AI */}
        <div className="p-3 rounded-lg bg-[#090d16] border border-[#30363d] font-mono text-xs space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
            <span className="text-[#4edea3] font-bold flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5" />
              AI FUNCTION CALL OUTPUT (NO FILLER):
            </span>
            {lastSpokenCommand && (
              <span className="text-[#38bdf8] truncate max-w-[170px]">
                INPUT: "{lastSpokenCommand}"
              </span>
            )}
          </div>
          <pre className="text-[11px] text-[#6ffbbe] overflow-x-auto leading-tight bg-black/50 p-2 rounded border border-[#10b981]/20">
            {displayFunctionCallJson}
          </pre>
        </div>

        {/* Right: Native Android Execution Status */}
        <div className="p-3 rounded-lg bg-[#090d16] border border-[#30363d] font-mono text-xs flex flex-col justify-between space-y-2">
          <div>
            <div className="flex items-center justify-between text-[10px] text-[#94a3b8] mb-1">
              <span className="text-[#ffc174] font-bold flex items-center gap-1">
                <PhoneCall className="w-3.5 h-3.5 text-[#10b981]" />
                ANDROID INTENT.ACTION_CALL EXECUTION:
              </span>
              <span className="text-[#10b981] font-bold">
                TARGET: {resolvedDialTarget}
              </span>
            </div>
            <div className="p-2 rounded bg-black/50 border border-[#f59e0b]/20 text-[11px] text-[#ffc174] break-all">
              {`startActivity(new Intent(Intent.ACTION_CALL, Uri.parse("tel:${resolvedDialTarget}")));`}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#94a3b8] pt-1 border-t border-[#30363d]">
            <span>
              STATUS:{' '}
              <strong className={callState.status === 'connected' ? 'text-[#10b981]' : 'text-white'}>
                {callState.status === 'connected'
                  ? `CONNECTED ON SPEAKER (${callState.phoneNumber})`
                  : 'READY FOR VOICE TRIGGER'}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => executeVoiceCallCommand(`Call ${activePhone} immediately.`)}
              className="px-2.5 py-1 rounded bg-[#10b981] text-black font-bold cursor-pointer"
            >
              TRIGGER NOW ({activePhone})
            </button>
          </div>
        </div>
      </div>

      {/* Expandable System Instructions + Tool Schema + Android Native Bridge Reference */}
      {showSchemaDrawer && (
        <div className="pt-2 border-t border-[#30363d] space-y-3 font-mono text-xs">
          {/* 1. System Instructions */}
          <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[#38bdf8] font-bold">1. SYSTEM INSTRUCTIONS (ACTIVE ON SERVER):</span>
              <button
                type="button"
                onClick={() => handleCopy('sys', SYSTEM_INSTRUCTIONS_TEXT)}
                className="px-2 py-1 rounded bg-[#1c2b3c] text-white flex items-center gap-1 text-[10px] cursor-pointer"
              >
                {copiedSection === 'sys' ? <Check className="w-3 h-3 text-[#10b981]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSection === 'sys' ? 'COPIED' : 'COPY PROMPT'}</span>
              </button>
            </div>
            <pre className="text-[11px] text-[#d4e4fa] whitespace-pre-wrap bg-black/50 p-2.5 rounded border border-[#30363d]">
              {SYSTEM_INSTRUCTIONS_TEXT}
            </pre>
          </div>

          {/* 2. Function Declaration JSON Schema */}
          <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[#4edea3] font-bold">2. TOOL / FUNCTION DEFINITION (JSON SCHEMA):</span>
              <button
                type="button"
                onClick={() => handleCopy('schema', TOOL_JSON_SCHEMA)}
                className="px-2 py-1 rounded bg-[#1c2b3c] text-white flex items-center gap-1 text-[10px] cursor-pointer"
              >
                {copiedSection === 'schema' ? <Check className="w-3 h-3 text-[#10b981]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSection === 'schema' ? 'COPIED' : 'COPY JSON'}</span>
              </button>
            </div>
            <pre className="text-[11px] text-[#6ffbbe] whitespace-pre-wrap bg-black/50 p-2.5 rounded border border-[#30363d]">
              {TOOL_JSON_SCHEMA}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
