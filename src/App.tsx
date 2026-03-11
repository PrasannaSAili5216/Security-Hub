import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Waveform } from './components/Waveform';
import { 
  Shield, 
  Terminal, 
  Binary, 
  Zap, 
  Download, 
  Upload,
  FileText, 
  Image as ImageIcon, 
  Mic, 
  Video, 
  RefreshCw, 
  Cpu, 
  Activity,
  Lock,
  Eye,
  Play,
  Pause,
  Info
} from 'lucide-react';
import { 
  generateText, 
  generateImage, 
  generateAudio, 
  generateVideo 
} from './services/gemini';
import {
  analyzeTextPII,
  analyzeImagePII,
  analyzeAudioPII,
  analyzeVideoPII,
  processTextCipher,
  processMediaCipher,
  maskAadhaarImage,
  PIIResult,
  CipherResult
} from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from 'jspdf';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'security' | 'live_info' | 'test_lab' | 'audit';
type GenType = 'text' | 'image' | 'audio' | 'video';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('security');
  const [genType, setGenType] = useState<GenType>('text');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [genMedia, setGenMedia] = useState<{ data: string; mimeType: string } | null>(null);
  const genFileInputRef = useRef<HTMLInputElement>(null);

  const [testMode, setTestMode] = useState<GenType>('text');
  const [testResult, setTestResult] = useState<string | null>(null);

  // Security Workspace State
  const [securityMode, setSecurityMode] = useState<GenType>('text');
  const [securityOp, setSecurityOp] = useState<'scan' | 'cipher' | 'mask'>('scan');
  const [securityInput, setSecurityInput] = useState('');
  const [securityMedia, setSecurityMedia] = useState<{ data: string; mimeType: string; name?: string } | null>(null);
  const [securityResult, setSecurityResult] = useState<PIIResult | null>(null);
  const [securityCipherResult, setSecurityCipherResult] = useState<CipherResult | null>(null);
  const [cipherMode, setCipherMode] = useState<'encode' | 'decode'>('encode');
  const securityFileInputRef = useRef<HTMLInputElement>(null);

  // Audit State
  const [auditLogs, setAuditLogs] = useState<{ msg: string; type: 'info' | 'success' | 'error' }[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);

  // Live Session State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'active'>('idle');

  const handleLiveToggle = () => {
    if (isLiveActive) {
      setIsLiveActive(false);
      setLiveStatus('idle');
    } else {
      setLiveStatus('connecting');
      setTimeout(() => {
        setIsLiveActive(true);
        setLiveStatus('active');
      }, 1500);
    }
  };

  const handleGenerate = async (isTest: boolean = false) => {
    const currentPrompt = isTest ? getTestPrompt(testMode) : prompt;
    const currentType = isTest ? testMode : genType;

    if (!currentPrompt.trim() && !isTest) return;
    
    if (isTest) setIsGenerating(true);
    else setIsGenerating(true);

    setError(null);
    if (isTest) setTestResult(null);
    else setResult(null);

    try {
      let res: string;
      switch (currentType) {
        case 'text': res = await generateText(currentPrompt); break;
        case 'image': res = await generateImage(currentPrompt, genMedia?.data); break;
        case 'audio': res = await generateAudio(currentPrompt); break;
        case 'video': res = await generateVideo(currentPrompt, genMedia?.data); break;
        default: throw new Error("Invalid type");
      }
      if (isTest) setTestResult(res);
      else setResult(res);
    } catch (err: any) {
      setError(err.message || "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSecurityAction = async () => {
    setIsGenerating(true);
    setSecurityResult(null);
    setSecurityCipherResult(null);
    try {
      if (securityOp === 'scan') {
        let res: PIIResult;
        if (securityMode === 'text') res = await analyzeTextPII(securityInput, securityMedia || undefined);
        else if (securityMode === 'image') res = await analyzeImagePII(securityMedia?.data || '');
        else if (securityMode === 'audio') res = await analyzeAudioPII(securityMedia?.data || '', securityMedia?.mimeType || '');
        else res = await analyzeVideoPII(securityMedia?.data || '', securityMedia?.mimeType || '');
        setSecurityResult(res);
      } else if (securityOp === 'mask') {
        if (securityMode === 'image' && securityMedia) {
          const masked = await maskAadhaarImage(securityMedia.data);
          setSecurityResult({
            sensitiveData: ["Aadhaar Number", "Photo", "QR Code"],
            suggestions: "Masking applied to protect sensitive Aadhaar details.",
            isSafe: true,
            maskedImage: masked || undefined
          });
        } else {
          throw new Error("Masking is only supported for images.");
        }
      } else {
        let res: CipherResult;
        if (securityMode === 'text') {
          res = await processTextCipher(securityInput, cipherMode, securityMedia || undefined);
          if (securityMedia?.name) {
            res.originalFileName = securityMedia.name;
            res.originalMimeType = securityMedia.mimeType;
          }
        } else {
          res = await processMediaCipher(securityMedia?.data || '', securityMedia?.mimeType || '', cipherMode === 'encode' ? 'encrypt' : 'decrypt');
          if (securityMedia?.name) {
            res.originalFileName = securityMedia.name;
            res.originalMimeType = securityMedia.mimeType;
          }
        }
        setSecurityCipherResult(res);
      }
    } catch (err: any) {
      console.error("Security operation failed:", err);
      setError(err.message || "Security operation failed. The file might be too large or the service is temporarily unavailable.");
    } finally {
      setIsGenerating(false);
    }
  };

  const runSystemAudit = async () => {
    setIsAuditing(true);
    setAuditLogs([]);
    setAuditProgress(0);
    const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
      setAuditLogs(prev => [...prev, { msg, type }]);
    };

    try {
      addLog("Initializing System Audit v1.0...");
      setAuditProgress(10);
      await new Promise(r => setTimeout(r, 800));
      
      // Test 1: Text Pipeline
      addLog("Testing Text Pipeline: Generating Indian PII sample...");
      setAuditProgress(30);
      const text = await generateText("Generate a test sentence with a fake Indian name and an Indian email address.");
      addLog("Text generated. Running PII Scan...", 'success');
      setAuditProgress(50);
      const scan = await analyzeTextPII(text);
      addLog(`Scan complete. Found ${scan.sensitiveData.length} elements.`, scan.isSafe ? 'success' : 'info');
      setAuditProgress(70);
      await new Promise(r => setTimeout(r, 800));
      
      // Test 2: Image Pipeline
      addLog("Testing Image Pipeline: Synthesizing Indian test ID...");
      setAuditProgress(85);
      const img = await generateImage("A simple mock Indian ID card for testing.");
      addLog("Image generated. Running Vision Scan...", 'success');
      const imgScan = await analyzeImagePII(img);
      addLog(`Vision scan complete. Safe: ${imgScan.isSafe}`, 'success');
      setAuditProgress(95);

      // Test 3: Cipher Engine
      addLog("Testing Cipher Engine: Encrypting sensitive payload...");
      const cipher = await processTextCipher("SECRET_ACCESS_KEY_12345", 'encode');
      addLog(`Encryption successful. Key: ${cipher.keyUsed}`, 'success');
      setAuditProgress(100);

      addLog("System Audit Complete. All modules operational.", 'success');
    } catch (err: any) {
      addLog(`Audit Failed: ${err.message}`, 'error');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleSecurityFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (limit to 10MB for stability in preview)
      if (file.size > 10 * 1024 * 1024) {
        setError("File is too large. Please upload a file smaller than 10MB.");
        return;
      }
      
      if (securityMode === 'text' && file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onloadend = () => {
          setSecurityInput(reader.result as string);
          setSecurityMedia({ data: '', mimeType: file.type, name: file.name });
        };
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          setSecurityMedia({ data: reader.result as string, mimeType: file.type, name: file.name });
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSecurityPaste = (e: React.ClipboardEvent) => {
    if (securityMode === 'text') {
      const text = e.clipboardData.getData('text');
      if (text) setSecurityInput(text);
      return;
    }
    if (securityMode !== 'image') return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setSecurityMedia({ data: reader.result as string, mimeType: blob.type });
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  const getTestPrompt = (type: GenType) => {
    switch (type) {
      case 'text': return "Generate a short paragraph of text that includes realistic but fake Indian PII like a name (e.g., Rajesh Kumar), an Indian email (e.g., rajesh.k@rediffmail.com), an Indian phone number (+91 98210 54321), and a mock address in Bangalore for testing a PII scanner.";
      case 'image': return "A high-quality top-down photo of a mock Indian government-style identification card with a portrait of an Indian man, the name 'Vikram Singh', a mock 12-digit ID number, and an address in New Delhi, placed on a marble surface.";
      case 'audio': return "Say clearly in an Indian accent: Namaste, this is a confidential security briefing. The access code for the main vault is seven four two nine. Please keep this information secure.";
      case 'video': return "A grainy security camera view of a person walking through a busy office in Bangalore with Indian decor and blinking server lights in the background.";
    }
  };

  const handleDownload = (data: string | null, type: GenType, fileName?: string, mimeType?: string, forcePdf: boolean = false) => {
    if (!data) return;
    
    let finalFileName = fileName;
    let finalData = data;
    let isEncrypted = cipherMode === 'encode' && (fileName?.startsWith('processed_') || fileName?.includes('encrypted'));

    // If encrypted and NOT forced to PDF, we use the Secure Vault Format
    if (isEncrypted && !forcePdf) {
      // Prepend a protocol header to break standard file parsing
      finalData = `SECURE_VAULT_PROTOCOL_V1_LOCKED\n${data}`;
      
      if (finalFileName?.toLowerCase().endsWith('.pdf')) {
        finalFileName = finalFileName.replace(/\.pdf$/i, '.vault');
      } else if (!finalFileName?.includes('.')) {
        finalFileName = `${finalFileName || 'encrypted_data'}.vault`;
      }
      mimeType = 'application/octet-stream'; // Force unknown type
    }

    // Special handling for PDF generation
    if (forcePdf || (!isEncrypted && (mimeType === 'application/pdf' || finalFileName?.toLowerCase().endsWith('.pdf')))) {
      try {
        const doc = new jsPDF();
        doc.setFont("courier");
        doc.setFontSize(10);
        
        // Add a header
        doc.setFont("helvetica", "bold");
        doc.text("CIPHER ENGINE - SECURE OUTPUT", 15, 15);
        doc.setFont("courier", "normal");
        doc.setFontSize(8);
        doc.text(`Timestamp: ${new Date().toLocaleString()}`, 15, 22);
        doc.line(15, 25, 195, 25);
        
        // Split text into lines to fit PDF width
        const splitText = doc.splitTextToSize(finalData, 180);
        doc.text(splitText, 15, 35);
        
        // Ensure extension is .pdf if forced
        if (forcePdf && !finalFileName?.toLowerCase().endsWith('.pdf')) {
          finalFileName = `${finalFileName?.split('.')[0] || 'security_output'}.pdf`;
        }

        doc.save(finalFileName || `security_output_${Date.now()}.pdf`);
        return;
      } catch (err) {
        console.error("PDF generation failed, falling back to blob:", err);
      }
    }

    const link = document.createElement('a');
    if (type === 'text') {
      const blob = new Blob([finalData], { type: mimeType || 'text/plain' });
      link.href = URL.createObjectURL(blob);
      link.download = finalFileName || `test_sample_${Date.now()}.txt`;
    } else {
      link.href = finalData;
      link.download = finalFileName || `test_sample_${Date.now()}.${type === 'image' ? 'png' : type === 'audio' ? 'wav' : 'mp4'}`;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerSelfDestruct = () => {
    setIsGenerating(true); // Show processing state
    setTimeout(() => {
      setSecurityResult(null);
      setSecurityCipherResult(null);
      setSecurityInput('');
      setSecurityMedia(null);
      setError("SECURITY PROTOCOL: Session data has been purged after download.");
      setIsGenerating(false);
    }, 1500);
  };

  const handleSendToWorkspace = () => {
    if (!testResult) return;
    
    setSecurityMode(testMode);
    if (testMode === 'text') {
      setSecurityInput(testResult);
      setSecurityMedia(null);
    } else {
      setSecurityInput('');
      setSecurityMedia({ 
        data: testResult, 
        mimeType: testMode === 'image' ? 'image/png' : testMode === 'audio' ? 'audio/wav' : 'video/mp4' 
      });
    }
    setActiveTab('security');
  };

  const handleGenFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGenMedia({ data: reader.result as string, mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenPaste = (e: React.ClipboardEvent) => {
    if (genType !== 'image') return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setGenMedia({ data: reader.result as string, mimeType: blob.type });
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-bg-main text-text-main font-sans selection:bg-brand-primary/10">
      {/* Navigation */}
      <nav className="glass-nav">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-lg shadow-stone-200">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold tracking-tight text-2xl text-stone-900">Security<span className="text-brand-primary">Hub</span></span>
          </div>

          <div className="flex gap-1 bg-stone-100 p-1 rounded-2xl border border-stone-200">
            {[
              { id: 'security', label: 'Security', icon: Lock },
              { id: 'audit', label: 'Audit', icon: Shield },
              { id: 'test_lab', label: 'Test Lab', icon: Terminal },
              { id: 'live_info', label: 'Live API', icon: Activity }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn(
                  "px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                  activeTab === tab.id 
                    ? "bg-white text-brand-primary shadow-sm" 
                    : "text-stone-500 hover:text-stone-900 hover:bg-white/50"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-16">
        <AnimatePresence mode="wait">
          {activeTab === 'test_lab' && (
            <motion.div
              key="test_lab"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-5xl mx-auto space-y-12"
            >
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-stone-100 border border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-500">
                  Quality Assurance Module
                </div>
                <h2 className="text-5xl font-extrabold tracking-tight text-stone-900">
                  Diagnostic <span className="text-brand-primary">Test Lab</span>
                </h2>
                <p className="text-stone-500 text-lg max-w-xl mx-auto leading-relaxed">
                  Generate standardized test assets to verify PII scanning and encryption engine performance.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="lg:col-span-1 space-y-4"
                >
                  {[
                    { id: 'text', label: 'Indian PII Text', icon: FileText, desc: 'Names/Emails (Indian Context)' },
                    { id: 'image', label: 'Indian ID Card', icon: ImageIcon, desc: 'Visual PII (Indian Style)' },
                    { id: 'audio', label: 'Indian Audio', icon: Mic, desc: 'Voice data (Indian Accent)' },
                    { id: 'video', label: 'Indian Office Video', icon: Video, desc: 'Motion data (Indian Office)' }
                  ].map((t, idx) => (
                    <motion.button
                      key={t.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + idx * 0.05 }}
                      onClick={() => { setTestMode(t.id as GenType); setTestResult(null); }}
                      className={cn(
                        "w-full p-6 rounded-2xl border text-left transition-all flex items-center gap-5",
                        testMode === t.id 
                          ? "bg-brand-primary/5 border-brand-primary shadow-sm" 
                          : "bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                      )}
                    >
                      <div className={cn("p-4 rounded-xl transition-colors", testMode === t.id ? "bg-brand-primary text-white" : "bg-stone-100 text-stone-400")}>
                        <t.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-bold text-stone-900">{t.label}</div>
                        <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">{t.desc}</div>
                      </div>
                    </motion.button>
                  ))}

                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={isGenerating}
                    className="btn-primary w-full flex items-center justify-center gap-3 mt-6 group"
                  >
                    {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                    {isGenerating ? "Preparing..." : "Generate Test Asset"}
                  </button>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="lg:col-span-2"
                >
                  <div className="h-full min-h-[450px] modern-card p-10 flex flex-col items-center justify-center relative overflow-hidden modern-card-hover">
                    <div className="absolute top-6 left-8 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-stone-300" />
                      <span className="text-[10px] uppercase font-bold text-stone-300 tracking-widest">Test_Output_Buffer</span>
                    </div>

                    {isGenerating ? (
                      <div className="text-center space-y-6">
                        <div className="w-14 h-14 border-4 border-stone-100 border-t-brand-primary rounded-full animate-spin mx-auto" />
                        <p className="text-xs uppercase tracking-widest font-bold text-brand-primary animate-pulse">Synthesizing_Test_Data...</p>
                      </div>
                    ) : testResult ? (
                      <div className="w-full h-full flex flex-col items-center justify-center space-y-8">
                        <div className="w-full max-w-lg bg-stone-50 border border-stone-100 rounded-2xl p-6 overflow-hidden shadow-sm">
                          {testMode === 'text' && <p className="text-sm font-mono text-stone-600 line-clamp-6">{testResult}</p>}
                          {testMode === 'image' && <img src={testResult} className="w-full h-40 object-cover rounded-xl" />}
                          {testMode === 'audio' && <div className="flex items-center justify-center h-40 bg-white rounded-xl"><Mic className="w-16 h-16 text-stone-200" /></div>}
                          {testMode === 'video' && <div className="flex items-center justify-center h-40 bg-white rounded-xl"><Video className="w-16 h-16 text-stone-200" /></div>}
                        </div>
                        <div className="flex flex-wrap justify-center gap-4">
                          <button 
                            onClick={handleSendToWorkspace}
                            className="btn-primary flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
                          >
                            <Zap className="w-5 h-5" /> Send to Workspace
                          </button>
                          <button 
                            onClick={() => handleDownload(testResult, testMode)}
                            className="btn-secondary flex items-center gap-3"
                          >
                            <Download className="w-5 h-5" /> Download
                          </button>
                          <button 
                            onClick={() => setTestResult(null)}
                            className="btn-secondary text-red-500 hover:text-red-600"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-6 opacity-20">
                        <Binary className="w-16 h-16 mx-auto text-stone-400" />
                        <p className="text-xs uppercase tracking-widest font-bold text-stone-500">Select Module To Begin</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div
              key="security"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-16"
            >
              <div className="text-center space-y-4">
                <h2 className="text-5xl font-extrabold tracking-tight text-stone-900">
                  Security <span className="text-brand-primary">Workspace</span>
                </h2>
                <p className="text-stone-500 text-lg max-w-2xl mx-auto leading-relaxed">
                  Execute PII scanning and cryptographic operations on your own data streams.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="lg:col-span-5 space-y-10"
                >
                  <div className="flex gap-2 bg-stone-100 p-1.5 rounded-2xl border border-stone-200">
                    {[
                      { id: 'scan', label: 'PII Scanner', icon: Eye },
                      { id: 'cipher', label: 'Cipher Engine', icon: Lock }
                    ].map((op) => (
                      <button
                        key={op.id}
                        onClick={() => {
                          setSecurityOp(op.id as any);
                        }}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-3",
                          securityOp === op.id ? "bg-white text-brand-primary shadow-sm" : "text-stone-500 hover:text-stone-900"
                        )}
                      >
                        <op.icon className="w-4 h-4" />
                        {op.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { id: 'text', icon: FileText, label: 'Text' },
                      { id: 'image', icon: ImageIcon, label: 'Image' },
                      { id: 'audio', icon: Mic, label: 'Audio' },
                      { id: 'video', icon: Video, label: 'Video' }
                    ].map((m, idx) => (
                      <motion.button
                        key={m.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 + idx * 0.05 }}
                        onClick={() => { setSecurityMode(m.id as GenType); setSecurityMedia(null); setSecurityInput(''); }}
                        className={cn(
                          "p-4 rounded-2xl border transition-all flex flex-col items-center gap-2",
                          securityMode === m.id 
                            ? "bg-brand-primary/5 border-brand-primary text-brand-primary" 
                            : "bg-white border-stone-200 text-stone-400 hover:border-stone-300"
                        )}
                      >
                        <m.icon className="w-5 h-5" />
                        <span className="text-[10px] uppercase font-bold tracking-wider">{m.label}</span>
                      </motion.button>
                    ))}
                  </div>

                  <div className="space-y-6">
                    {securityMode === 'text' ? (
                      <div className="space-y-6">
                        {!securityInput && !securityMedia ? (
                          <div 
                            onPaste={handleSecurityPaste}
                            className="w-full h-56 bg-stone-50 border-2 border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center relative group overflow-hidden hover:border-brand-primary/40 transition-colors"
                          >
                            <div className="text-center space-y-3">
                              <Upload className="w-10 h-10 mx-auto text-stone-300 group-hover:text-brand-primary transition-colors" />
                              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                                Upload or Paste Text (Max 10MB)
                              </p>
                              <button 
                                onClick={() => securityFileInputRef.current?.click()}
                                className="text-sm text-brand-primary font-bold hover:underline"
                              >
                                Browse Files
                              </button>
                            </div>
                          </div>
                        ) : securityInput ? (
                          <div className="relative group">
                            <textarea
                              value={securityInput}
                              onChange={(e) => setSecurityInput(e.target.value)}
                              placeholder={securityOp === 'scan' ? "Paste text for PII analysis..." : "Paste text for encryption/decryption..."}
                              className="w-full h-56 bg-white border border-stone-200 rounded-2xl p-6 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all resize-none font-mono placeholder:text-stone-300 shadow-sm"
                            />
                            <button 
                              onClick={() => setSecurityInput('')}
                              className="absolute top-4 right-4 p-2 bg-white shadow-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-stone-100"
                            >
                              <RefreshCw className="w-4 h-4 text-stone-600" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-8 bg-stone-50 border border-stone-200 rounded-3xl">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center">
                                <FileText className="w-6 h-6 text-brand-primary" />
                              </div>
                              <div>
                                <span className="text-sm font-bold text-stone-900">
                                  {securityMedia?.mimeType.split('/')[1]?.toUpperCase() || 'DOCUMENT'}
                                </span>
                                <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">Document Loaded</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setSecurityMedia(null)}
                              className="p-3 hover:bg-stone-200 rounded-full transition-colors"
                            >
                              <RefreshCw className="w-5 h-5 text-stone-400" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div 
                        onPaste={handleSecurityPaste}
                        className="w-full h-56 bg-stone-50 border-2 border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center relative group overflow-hidden hover:border-brand-primary/40 transition-colors"
                      >
                        {securityMedia ? (
                          <div className="w-full h-full flex items-center justify-center p-4">
                            {securityMedia.mimeType.startsWith('image/') && <img src={securityMedia.data} className="max-h-full object-contain rounded-lg" />}
                            {securityMedia.mimeType.startsWith('audio/') && <Mic className="w-16 h-16 text-brand-primary animate-pulse" />}
                            {securityMedia.mimeType.startsWith('video/') && <Video className="w-16 h-16 text-brand-primary animate-pulse" />}
                            <button 
                              onClick={() => setSecurityMedia(null)}
                              className="absolute top-4 right-4 p-2.5 bg-white shadow-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-stone-100"
                            >
                              <RefreshCw className="w-4 h-4 text-stone-600" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-center space-y-3">
                            <Upload className="w-10 h-10 mx-auto text-stone-300 group-hover:text-brand-primary transition-colors" />
                            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                              {securityMode === 'image' ? 'Upload or Paste Image' : `Upload ${securityMode}`}
                            </p>
                            <button 
                              onClick={() => securityFileInputRef.current?.click()}
                              className="text-sm text-brand-primary font-bold hover:underline"
                            >
                              Browse Files
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={securityFileInputRef} 
                      onChange={handleSecurityFileUpload} 
                      className="hidden" 
                      accept={
                        securityMode === 'text' 
                          ? '.txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain' 
                          : securityMode === 'image' ? 'image/*' 
                          : securityMode === 'audio' ? 'audio/*' 
                          : 'video/*'
                      } 
                    />

                    {securityOp === 'cipher' && (
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setCipherMode('encode')}
                          className={cn("flex-1 py-3 rounded-xl border text-xs font-bold uppercase transition-all", cipherMode === 'encode' ? "bg-brand-primary text-white border-brand-primary shadow-sm" : "bg-white border-stone-200 text-stone-400 hover:border-stone-300")}
                        >
                          Encrypt
                        </button>
                        <button 
                          onClick={() => setCipherMode('decode')}
                          className={cn("flex-1 py-3 rounded-xl border text-xs font-bold uppercase transition-all", cipherMode === 'decode' ? "bg-brand-primary text-white border-brand-primary shadow-sm" : "bg-white border-stone-200 text-stone-400 hover:border-stone-300")}
                        >
                          Decrypt
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleSecurityAction}
                      disabled={isGenerating || (securityMode === 'text' ? (!securityInput && !securityMedia) : !securityMedia)}
                      className="btn-primary w-full flex items-center justify-center gap-3 group"
                    >
                      {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 group-hover:rotate-12 transition-transform" />}
                      {isGenerating ? "Analyzing..." : `Execute ${securityOp.charAt(0).toUpperCase() + securityOp.slice(1)}`}
                    </button>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="lg:col-span-7"
                >
                  <div className="h-full min-h-[550px] modern-card p-10 flex flex-col relative overflow-hidden modern-card-hover">
                    <div className="absolute top-8 left-10 right-10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-stone-300" />
                        <span className="text-[10px] uppercase font-bold text-stone-300 tracking-widest">Security_Output</span>
                      </div>
                      <button 
                        onClick={() => {
                          setSecurityResult(null);
                          setSecurityCipherResult(null);
                          setSecurityInput('');
                          setSecurityMedia(null);
                          setError(null);
                        }}
                        className="p-2 text-stone-300 hover:text-stone-900 transition-colors rounded-lg hover:bg-stone-50"
                        title="Clear Workspace"
                      >
                        <RefreshCw className={cn("w-3 h-3", isGenerating && "animate-spin")} />
                      </button>
                    </div>

                    <div className="flex-1 flex items-center justify-center">
                      {!securityResult && !securityCipherResult && !isGenerating && (
                        <div className="text-center space-y-6 opacity-20">
                          <Shield className="w-20 h-20 mx-auto text-stone-400" />
                          <p className="text-sm uppercase tracking-widest font-bold text-stone-500">Awaiting Security Protocol</p>
                        </div>
                      )}

                      {isGenerating && (
                        <div className="text-center space-y-8">
                          <div className="w-20 h-20 border-4 border-stone-100 border-t-brand-primary rounded-full animate-spin mx-auto" />
                          <p className="text-lg font-bold text-stone-900 uppercase tracking-tight">Processing Data Stream</p>
                        </div>
                      )}

                      {securityResult && (
                        <div className="w-full space-y-8">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold uppercase text-brand-primary tracking-wider">Scan Results</h4>
                            <span className={cn("px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider", securityResult.isSafe ? "bg-emerald-500 text-white" : "bg-red-500 text-white")}>
                              {securityResult.isSafe ? 'Secure' : 'Vulnerable'}
                            </span>
                          </div>
                          <div className="space-y-6">
                            <div>
                              <p className="text-xs font-bold uppercase text-stone-400 mb-3 tracking-widest">Detected Elements</p>
                              <div className="flex flex-wrap gap-3">
                                {securityResult.sensitiveData.map((d, i) => (
                                  <span key={i} className="px-4 py-2 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold rounded-xl">{d}</span>
                                ))}
                                {securityResult.sensitiveData.length === 0 && <span className="text-sm text-stone-400 italic">No sensitive data found</span>}
                              </div>
                            </div>
                            <div className="p-8 bg-stone-50 border border-stone-100 rounded-3xl">
                              <p className="text-xs font-bold uppercase text-stone-400 mb-4 tracking-widest">Recommendations</p>
                              <p className="text-sm leading-relaxed text-stone-600">{securityResult.suggestions}</p>
                            </div>

                            {securityResult.redactedImage && (
                              <div className="space-y-4">
                                <p className="text-xs font-bold uppercase text-stone-400 tracking-widest">Redacted Preview (Blurred/Replaced)</p>
                                <div className="relative group overflow-hidden rounded-3xl border border-stone-200 bg-white">
                                  <img src={securityResult.redactedImage} className="w-full object-contain max-h-[400px]" />
                                </div>
                              </div>
                            )}

                            {securityResult.maskedImage && (
                              <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold uppercase text-stone-400 tracking-widest">Masked Aadhaar Result</p>
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                                    <Shield className="w-3 h-3" /> COMPLIANT
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <p className="text-[10px] uppercase font-bold text-stone-400 text-center">Original (Regular)</p>
                                    <div className="rounded-2xl border border-stone-200 overflow-hidden bg-stone-100">
                                      <img src={securityMedia?.data} className="w-full h-48 object-contain" />
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-[10px] uppercase font-bold text-brand-primary text-center">Masked (Secure)</p>
                                    <div className="rounded-2xl border-2 border-brand-primary/20 overflow-hidden bg-white shadow-lg shadow-brand-primary/5">
                                      <img src={securityResult.maskedImage} className="w-full h-48 object-contain" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {securityCipherResult && (
                        <div className="w-full space-y-8">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold uppercase text-brand-primary tracking-wider">Cipher Output</h4>
                            <span className="text-xs font-mono text-stone-400 bg-stone-100 px-3 py-1 rounded-lg">{securityCipherResult.keyUsed}</span>
                          </div>
                          <div className="p-8 bg-stone-50 border border-stone-100 rounded-3xl shadow-inner">
                            <p className="text-sm font-mono break-all leading-relaxed text-stone-700">{securityCipherResult.output}</p>
                          </div>
                          {securityCipherResult.originalFileName && !securityCipherResult.originalMimeType?.startsWith('image/') && (
                            <div className="flex flex-wrap justify-center gap-4">
                              <button 
                                onClick={() => handleDownload(securityCipherResult.output, 'text', `processed_${securityCipherResult.originalFileName}`, securityCipherResult.originalMimeType)}
                                className="btn-primary flex items-center gap-3"
                              >
                                <Download className="w-5 h-5" /> Download {cipherMode === 'encode' ? 'Encrypted' : 'Decrypted'} {securityCipherResult.originalFileName.split('.').pop()?.toUpperCase()}
                              </button>

                              <button 
                                onClick={() => handleDownload(securityCipherResult.output, 'text', `pdf_export_${securityCipherResult.originalFileName.split('.')[0]}.pdf`, 'application/pdf', true)}
                                className="btn-secondary flex items-center gap-3 border-stone-200 text-stone-600"
                              >
                                <FileText className="w-5 h-5" /> Download as PDF
                              </button>
                              
                              {cipherMode === 'decode' && securityCipherResult.binaryOutput && (
                                <button 
                                  onClick={() => handleDownload(securityCipherResult.binaryOutput!, 'text', `binary_decrypted_${securityCipherResult.originalFileName.split('.')[0]}.pdf`, 'application/pdf')}
                                  className="btn-secondary flex items-center gap-3 border-brand-primary/30 text-brand-primary"
                                >
                                  <Binary className="w-5 h-5" /> Download as Binary PDF
                                </button>
                              )}
                            </div>
                          )}
                          <div className="p-6 bg-brand-primary/5 border border-brand-primary/10 rounded-3xl">
                            <p className="text-xs font-bold uppercase text-brand-primary mb-3 tracking-widest">Technical Explanation</p>
                            <p className="text-sm italic text-stone-600 leading-relaxed">{securityCipherResult.explanation}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {activeTab === 'audit' && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-4xl mx-auto space-y-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-5xl font-extrabold tracking-tight text-stone-900">
                  System <span className="text-brand-primary">Audit</span>
                </h2>
                <p className="text-stone-500 text-lg leading-relaxed">Run a comprehensive end-to-end diagnostic of all multi-modal security pipelines.</p>
              </div>

              <div className="modern-card p-10 space-y-10 modern-card-hover">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center">
                      <Shield className="w-6 h-6 text-brand-primary" />
                    </div>
                    <div>
                      <span className="text-sm font-bold uppercase tracking-widest text-stone-900">Automated Diagnostic Suite</span>
                      <p className="text-xs text-stone-400">v1.0.4 Build 2026</p>
                    </div>
                  </div>
                  <button
                    onClick={runSystemAudit}
                    disabled={isAuditing}
                    className="btn-primary flex items-center gap-3 group"
                  >
                    {isAuditing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                    {isAuditing ? "Running Audit..." : "Start Full Audit"}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-stone-400">
                    <span>Audit Progress</span>
                    <span>{auditProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${auditProgress}%` }}
                      className="h-full bg-brand-primary"
                    />
                  </div>
                </div>

                <div className="h-[450px] bg-stone-50 border border-stone-100 rounded-3xl p-8 overflow-y-auto custom-scrollbar font-mono text-xs space-y-3 shadow-inner">
                  {auditLogs.length === 0 && <p className="text-stone-400 italic text-center py-20">Awaiting audit initialization...</p>}
                  <AnimatePresence>
                    {auditLogs.map((log, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn(
                          "flex gap-6 p-3 rounded-xl transition-colors",
                          log.type === 'success' ? "bg-emerald-50 text-emerald-700" : log.type === 'error' ? "bg-red-50 text-red-700" : "bg-white/50 text-stone-600"
                        )}
                      >
                        <span className="opacity-40 font-bold">[{new Date().toLocaleTimeString()}]</span>
                        <span className="font-medium">{log.msg}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {isAuditing && (
                    <div className="flex items-center gap-3 p-3 text-brand-primary font-bold">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processing System Modules...</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'live_info' && (
            <motion.div
              key="live"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-5xl mx-auto space-y-16"
            >
              <div className="bg-white border border-stone-200 p-16 rounded-[3.5rem] relative overflow-hidden shadow-sm modern-card-hover">
                <div className="absolute top-0 right-0 p-16 opacity-[0.03] pointer-events-none">
                  <Activity className="w-72 h-72 text-brand-primary" />
                </div>

                <div className="relative z-10 space-y-12">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="space-y-6">
                      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-primary text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-stone-100">
                        Core Technology
                      </div>
                      <h2 className="text-6xl font-extrabold tracking-tight text-stone-900 leading-tight">The <span className="text-brand-primary">Live</span> <br />Operation.</h2>
                      <p className="text-xl text-stone-500 leading-relaxed max-w-2xl">
                        Gemini Live is a real-time, low-latency multimodal interface that enables natural, fluid conversations with AI.
                      </p>
                    </div>

                    <div className="w-full md:w-80 bg-stone-50 border border-stone-100 rounded-[2rem] p-8 space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-stone-400">Session Status</span>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", liveStatus === 'active' ? "bg-emerald-500 animate-pulse" : liveStatus === 'connecting' ? "bg-amber-500 animate-bounce" : "bg-stone-300")} />
                          <span className="text-[10px] font-bold uppercase text-stone-500">{liveStatus}</span>
                        </div>
                      </div>
                      
                      <div className="h-24 flex items-center justify-center">
                        {liveStatus === 'active' ? (
                          <Waveform />
                        ) : (
                          <Mic className={cn("w-10 h-10 text-stone-200", liveStatus === 'connecting' && "animate-pulse")} />
                        )}
                      </div>

                      <button 
                        onClick={handleLiveToggle}
                        className={cn(
                          "w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all",
                          isLiveActive ? "bg-red-50 text-red-600 border border-red-100" : "bg-brand-primary text-white shadow-md shadow-stone-200"
                        )}
                      >
                        {liveStatus === 'connecting' ? "Initializing..." : isLiveActive ? "End Session" : "Start Live Session"}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {[
                      { 
                        title: 'Real-Time Voice', 
                        desc: 'Interruptible, low-latency audio streaming for human-like dialogue.',
                        icon: Mic
                      },
                      { 
                        title: 'Visual Perception', 
                        desc: 'Processes live video frames to understand and react to the physical world.',
                        icon: Video
                      },
                      { 
                        title: 'Multimodal Fusion', 
                        desc: 'Simultaneously handles audio, video, and text for unified context.',
                        icon: Zap
                      },
                      { 
                        title: 'Tool Integration', 
                        desc: 'Can trigger function calls and external tools during live sessions.',
                        icon: Cpu
                      }
                    ].map((feature, idx) => (
                      <motion.div 
                        key={feature.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + idx * 0.1 }}
                        className="bg-stone-50 p-8 rounded-3xl border border-stone-100 space-y-4 hover:shadow-md transition-shadow"
                      >
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                          <feature.icon className="w-6 h-6 text-brand-primary" />
                        </div>
                        <h4 className="font-bold text-lg text-stone-900">{feature.title}</h4>
                        <p className="text-sm text-stone-500 leading-relaxed">{feature.desc}</p>
                      </motion.div>
                    ))}
                  </div>

                  <div className="pt-10 border-t border-stone-100 flex items-center gap-4">
                    <Info className="w-6 h-6 text-stone-300" />
                    <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">
                      Implementation requires Web Audio API & MediaStream Recording
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="bg-white border border-stone-200 p-10 rounded-[2.5rem] space-y-6 shadow-sm">
                  <h3 className="font-bold uppercase text-xs tracking-widest text-brand-primary">How it works</h3>
                  <p className="text-base text-stone-600 leading-relaxed">
                    Unlike standard request-response cycles, the Live API maintains a persistent WebSocket connection. It streams PCM audio data at 16kHz and JPEG frames, receiving immediate audio responses that can be played back with zero perceived delay.
                  </p>
                </div>
                <div className="bg-white border border-stone-200 p-10 rounded-[2.5rem] space-y-6 shadow-sm">
                  <h3 className="font-bold uppercase text-xs tracking-widest text-brand-primary">Use Cases</h3>
                  <ul className="text-base text-stone-600 space-y-4">
                    <li className="flex items-center gap-3"><div className="w-2 h-2 bg-brand-primary rounded-full shadow-sm shadow-stone-200" /> Real-time language tutoring</li>
                    <li className="flex items-center gap-3"><div className="w-2 h-2 bg-brand-primary rounded-full shadow-sm shadow-stone-200" /> Interactive visual assistance</li>
                    <li className="flex items-center gap-3"><div className="w-2 h-2 bg-brand-primary rounded-full shadow-sm shadow-stone-200" /> Hands-free technical support</li>
                    <li className="flex items-center gap-3"><div className="w-2 h-2 bg-brand-primary rounded-full shadow-sm shadow-stone-200" /> Immersive storytelling</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-16 border-t border-stone-200 flex flex-col md:flex-row justify-between items-center gap-10">
        <div className="flex items-center gap-4 text-stone-400">
          <Shield className="w-5 h-5" />
          <span className="text-xs font-bold uppercase tracking-widest">Secure OmniGen Protocol v1.0.4</span>
        </div>
        <div className="flex gap-10 text-xs font-bold uppercase tracking-widest text-stone-400">
          <a href="#" className="hover:text-brand-primary transition-colors">Documentation</a>
          <a href="#" className="hover:text-brand-primary transition-colors">API Status</a>
          <a href="#" className="hover:text-brand-primary transition-colors">Security Policy</a>
        </div>
        <div className="text-xs text-stone-400 font-mono bg-stone-100 px-4 py-2 rounded-full">
          {new Date().toISOString()}
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
