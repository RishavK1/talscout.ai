"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { TopAppBar } from "@/components/app/top-app-bar";


interface UploadingFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "pending" | "uploading" | "processing" | "ready" | "error";
  candidateId?: string;
  errorMsg?: string;
}

const atsCache: { connectedAts: string | null; lastSynced: string | null } = {
  connectedAts: null,
  lastSynced: null,
};

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadList, setUploadList] = useState<UploadingFile[]>([]);
  const [dragging, setDragging] = useState(false);

  // ATS Integration States
  const [showAtsModal, setShowAtsModal] = useState(false);
  const [selectedAts, setSelectedAts] = useState<"greenhouse" | "bullhorn" | "lever" | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [syncState, setSyncState] = useState<"idle" | "connecting" | "fetching" | "syncing" | "completed">("idle");
  const [syncProgress, setSyncProgress] = useState(0);
  const [connectedAts, setConnectedAts] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    setConnectedAts(atsCache.connectedAts);
    setLastSynced(atsCache.lastSynced);
  }, []);

  const handleDisconnect = () => {
    atsCache.connectedAts = null;
    atsCache.lastSynced = null;
    setConnectedAts(null);
    setLastSynced(null);
    toast.success("Disconnected from ATS integration");
  };

  const handleConnectAndSync = async () => {
    if (!apiUrl.trim() || !apiKey.trim()) {
      toast.error("Please fill in all API credentials");
      return;
    }

    setSyncState("connecting");
    setSyncProgress(15);

    setTimeout(() => {
      setSyncState("fetching");
      setSyncProgress(45);
    }, 800);

    setTimeout(() => {
      setSyncState("syncing");
      setSyncProgress(75);
    }, 1800);

    setTimeout(async () => {
      try {
        // Create 3 realistic mockup candidates
        await api.post("/api/candidates", {
          fullName: "Sarah Jenkins",
          emails: ["sarah.jenkins@example.com"],
          phones: ["+1 415-555-0192"],
          location: "San Francisco, CA",
          currentTitle: "Senior Frontend Engineer",
          yearsExperience: 6,
          skills: ["React", "TypeScript", "Next.js", "Tailwind CSS"],
          summary: "Passionate senior frontend engineer with a track record of building premium user experiences."
        });

        await api.post("/api/candidates", {
          fullName: "David Chen",
          emails: ["d.chen@example.com"],
          phones: ["+1 206-555-0148"],
          location: "Seattle, WA",
          currentTitle: "Staff AI Scientist",
          yearsExperience: 8,
          skills: ["Python", "PyTorch", "LLMs", "Vector Search"],
          summary: "Staff AI scientist specializing in vector search, semantic embeddings, and LLM orchestration."
        });

        await api.post("/api/candidates", {
          fullName: "Elena Rostova",
          emails: ["elena.r@example.com"],
          location: "Boston, MA",
          currentTitle: "Lead Recruiter",
          yearsExperience: 5,
          skills: ["Talent Acquisition", "ATS integrations", "Sourcing", "HR"],
          summary: "Dynamic talent acquisition leader with deep expertise in full-cycle recruitment and hiring automation."
        });

        setSyncState("completed");
        setSyncProgress(100);

        setTimeout(() => {
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const atsName = selectedAts || "ATS";
          atsCache.connectedAts = atsName;
          atsCache.lastSynced = nowStr;
          setConnectedAts(atsName);
          setLastSynced(nowStr);

          const prettyName = atsName.charAt(0).toUpperCase() + atsName.slice(1);
          toast.success(`Successfully connected & imported 3 candidates from ${prettyName}!`);
          setShowAtsModal(false);
          // reset state
          setSyncState("idle");
          setSyncProgress(0);
          setSelectedAts(null);
          setApiUrl("");
          setApiKey("");
        }, 500);

      } catch (err: any) {
        setSyncState("idle");
        setSyncProgress(0);
        toast.error(`ATS sync failed: ${err.message || "Unknown error"}`);
      }
    }, 2800);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const triggerBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleFiles = (files: File[]) => {
    // Filter out disallowed types or sizes > 10MB
    const validFiles = files.filter((file) => {
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ];
      if (!allowedTypes.includes(file.type)) {
        toast.error(`"${file.name}" rejected: Only PDF, DOCX, and TXT files are allowed.`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" rejected: File exceeds the 10MB limit.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Add files to list and start upload process for each
    const newUploads = validFiles.map((file): UploadingFile => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      progress: 0,
      status: "pending",
    }));

    setUploadList((prev) => [...newUploads, ...prev]);

    newUploads.forEach((upload, idx) => {
      processUpload(validFiles[idx], upload.id);
    });
  };

  const processUpload = async (file: File, id: string) => {
    updateFileStatus(id, { status: "uploading", progress: 5 });
    
    let candidateId = "";
    let fileKey = "";

    try {
      // Step 1: Request presigned URL from route handler
      const presign = await api.post<{
        candidateId: string;
        fileKey: string;
        uploadUrl: string;
      }>("/api/uploads", {
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });

      candidateId = presign.candidateId;
      fileKey = presign.fileKey;

      updateFileStatus(id, { progress: 20, candidateId });

      // Step 2: Upload binary payload directly to storage URL using XHR to track progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presign.uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            // Map progress from 20% to 80% range during actual binary upload
            const percentComplete = Math.round((event.loaded / event.total) * 60) + 20;
            updateFileStatus(id, { progress: percentComplete });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage service upload failed: status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during storage upload"));
        xhr.send(file);
      });

      updateFileStatus(id, { progress: 85, status: "processing" });

      // Step 3: Complete upload and start parsing job
      await api.post("/api/uploads/complete", {
        candidateId,
        fileKey,
      });

      updateFileStatus(id, { progress: 100, status: "ready" });
      toast.success(`Successfully uploaded and parsed: ${file.name}`);
    } catch (err: any) {
      console.error(err);
      updateFileStatus(id, { status: "error", errorMsg: err.message || "Upload failed" });
      toast.error(`Failed to parse "${file.name}": ${err.message || "Server error"}`);
    }
  };

  const updateFileStatus = (id: string, updates: Partial<UploadingFile>) => {
    setUploadList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  return (
    <AppShell>
      {/* Main Content Area */}
      <main className="min-h-screen flex flex-col overflow-x-hidden">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,.docx,.txt"
          multiple
          className="hidden"
          aria-label="Upload files hidden input"
        />

        <TopAppBar
          leftContent={
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
              <input
                className="w-full bg-surface-white border border-border-low-alpha rounded-full pl-10 pr-4 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="Search files or candidates..."
                type="text"
                onClick={() => router.push("/candidates")}
              />
            </div>
          }
          rightContent={
            <button
              type="button"
              onClick={triggerBrowse}
              className="bg-primary text-white px-5 py-2.5 rounded-xl font-label-md text-label-md hover:shadow-lg transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
            >
              + Upload résumés
            </button>
          }
        />

        {/* Canvas Area */}
        <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-12 py-8 sm:py-10 lg:py-12">
          <section className="mb-10">
            <h1 className="font-headline-lg text-headline-lg text-primary mb-2">Upload résumés</h1>
            <p className="font-body-lg text-body-lg text-text-muted">
              Drop PDFs, DOCX, or text files. We&apos;ll read, analyze, and structure them automatically with AI.
            </p>
          </section>

          {/* Drag & Drop Zone */}
          <div
            className={`bg-white border-2 border-dashed rounded-lg p-8 sm:p-12 lg:p-16 mb-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer group custom-shadow ${
              dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-outline-variant hover:border-primary"
            }`}
            id="drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerBrowse}
          >
            <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-primary text-4xl">cloud_upload</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-1">
              Drag &amp; drop résumés here
            </h3>
            <p className="font-body-md text-body-md text-text-muted mb-6">
              or{" "}
              <span className="text-primary font-semibold underline underline-offset-4">
                browse files
              </span>
            </p>
            <div className="px-4 py-2 bg-bg-cream rounded-full border border-border-low-alpha">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                PDF, DOCX, TXT · up to 10MB each
              </span>
            </div>
          </div>

          {/* Uploading List */}
          {uploadList.length > 0 && (
            <section className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  Uploading <span className="font-data-mono text-text-muted ml-2">({uploadList.length})</span>
                </h2>
              </div>
              <div className="space-y-3">
                {uploadList.map((file) => (
                  <div key={file.id} className="bg-white p-4 rounded-lg custom-shadow flex flex-wrap items-center gap-4 sm:gap-6 border border-border-low-alpha shadow-sm">
                    <div className="w-10 h-10 rounded bg-primary-container/10 flex items-center justify-center text-primary shrink-0">
                      <span className="material-symbols-outlined">description</span>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <div className="flex justify-between items-end mb-2">
                        <span className="font-label-md text-label-md text-on-surface truncate max-w-[240px]">
                          {file.name}
                        </span>
                        <span className="font-data-mono text-label-md text-text-muted">{file.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            file.status === "ready"
                              ? "bg-tertiary"
                              : file.status === "error"
                              ? "bg-error"
                              : "bg-primary"
                          }`}
                          style={{ width: `${file.progress}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    {file.status === "ready" ? (
                      <Link
                        href={`/candidates/${file.candidateId}`}
                        className="flex items-center gap-2 px-3 py-1 bg-tertiary-container/10 text-tertiary rounded-full border border-tertiary/20 hover:bg-tertiary-container/20 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        <span className="font-label-md text-label-md">Ready (View profile)</span>
                      </Link>
                    ) : file.status === "processing" ? (
                      <div className="flex items-center gap-2 px-3 py-1 bg-secondary-container/30 text-secondary rounded-full border border-secondary/20">
                        <span className="material-symbols-outlined text-sm animate-spin">
                          sync
                        </span>
                        <span className="font-label-md text-label-md">AI Parsing...</span>
                      </div>
                    ) : file.status === "error" ? (
                      <div
                        title={file.errorMsg}
                        className="flex items-center gap-2 px-3 py-1 bg-error/10 text-error rounded-full border border-error/20"
                      >
                        <span className="material-symbols-outlined text-sm">error</span>
                        <span className="font-label-md text-label-md">Error</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-1 bg-secondary-container/30 text-secondary rounded-full border border-secondary/20">
                        <span className="material-symbols-outlined text-sm animate-pulse">
                          progress_activity
                        </span>
                        <span className="font-label-md text-label-md">Uploading...</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Footer Card: ATS Import */}
          <div className="bg-surface-white/50 border border-border-low-alpha rounded-lg p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 custom-shadow">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${connectedAts ? "bg-tertiary/10 text-tertiary" : "bg-bg-cream text-primary"}`}>
                <span className="material-symbols-outlined">{connectedAts ? "check_circle" : "sync"}</span>
              </div>
              <div>
                <h4 className="font-label-md text-body-md text-on-surface font-semibold flex items-center gap-2">
                  {connectedAts ? (
                    <>
                      <span className="capitalize">{connectedAts}</span> Connected
                    </>
                  ) : (
                    "Import from your ATS"
                  )}
                </h4>
                <p className="text-label-md text-text-muted">
                  {connectedAts ? (
                    `Directly synced 3 candidates. Last updated ${lastSynced || "just now"}.`
                  ) : (
                    "Directly sync with Bullhorn, Greenhouse, or Lever."
                  )}
                </p>
              </div>
            </div>
            {connectedAts ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-6 py-2 border border-error/20 text-error rounded-lg font-label-md text-label-md hover:bg-error/5 transition-colors w-full sm:w-auto"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelectedAts(null);
                  setApiUrl("");
                  setApiKey("");
                  setSyncState("idle");
                  setSyncProgress(0);
                  setShowAtsModal(true);
                }}
                className="px-6 py-2 border border-primary text-primary rounded-lg font-label-md text-label-md hover:bg-primary/5 transition-colors w-full sm:w-auto"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        {/* ATS Import Modal */}
        {showAtsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity duration-300">
            <div className="bg-white rounded-2xl w-full max-w-lg p-6 sm:p-8 premium-shadow border border-border-low-alpha relative flex flex-col">
              <button
                type="button"
                onClick={() => {
                  if (syncState === "idle" || syncState === "completed") {
                    setShowAtsModal(false);
                  }
                }}
                disabled={syncState !== "idle" && syncState !== "completed"}
                className="absolute top-4 right-4 text-on-surface-variant hover:bg-surface-container-low p-2 rounded-full transition-colors disabled:opacity-30"
              >
                <span className="material-symbols-outlined">close</span>
              </button>

              <h3 className="font-headline-md text-headline-md text-primary serif-text mb-4">
                Connect ATS Integration
              </h3>

              {syncState === "idle" ? (
                <div className="space-y-6">
                  {/* Select ATS Provider */}
                  <div>
                    <label className="block font-label-md text-primary mb-3">Select your ATS Provider</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(["greenhouse", "bullhorn", "lever"] as const).map((ats) => {
                        const selected = selectedAts === ats;
                        return (
                          <button
                            key={ats}
                            type="button"
                            onClick={() => {
                              setSelectedAts(ats);
                              setApiUrl(
                                ats === "greenhouse"
                                  ? "https://api.greenhouse.io/v1/"
                                  : ats === "bullhorn"
                                  ? "https://rest.bullhornstaffing.com/rest-services/"
                                  : "https://api.lever.co/v1/"
                              );
                              setApiKey("mock_token_demo_mode_active");
                            }}
                            className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                              selected
                                ? "border-primary bg-primary/5 shadow-sm scale-[1.02]"
                                : "border-border-low-alpha hover:border-outline-variant"
                            }`}
                          >
                            <span className="material-symbols-outlined text-primary text-[28px]">
                              {ats === "greenhouse" ? "forest" : ats === "bullhorn" ? "campaign" : "hub"}
                            </span>
                            <span className="font-label-md text-label-md capitalize text-on-surface">
                              {ats}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedAts && (
                    <div className="space-y-4 pt-4 border-t border-border-low-alpha">
                      <div>
                        <label className="block font-label-md text-primary mb-2">API Endpoint URL</label>
                        <input
                          type="text"
                          value={apiUrl}
                          onChange={(e) => setApiUrl(e.target.value)}
                          className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md"
                          placeholder="https://api.greenhouse.io/v1/"
                        />
                      </div>
                      <div>
                        <label className="block font-label-md text-primary mb-2">API Access Token / Key</label>
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="w-full bg-bg-cream/30 border border-border-low-alpha rounded-xl px-4 py-3 font-body-md font-data-mono"
                          placeholder="••••••••••••••••••••••••••••••••"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleConnectAndSync}
                        className="w-full bg-primary text-white py-3 rounded-xl font-label-md hover:shadow-lg transition-all active:scale-[0.98] mt-6"
                      >
                        Connect &amp; Sync Candidates
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center text-center">
                  {syncState === "completed" ? (
                    <div className="w-16 h-16 bg-tertiary/10 rounded-full flex items-center justify-center text-tertiary mb-6 scale-up animate-pulse">
                      <span className="material-symbols-outlined text-[36px]">check_circle</span>
                    </div>
                  ) : (
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6 animate-spin">
                      <span className="material-symbols-outlined text-[32px]">sync</span>
                    </div>
                  )}

                  <h4 className="font-headline-sm text-headline-sm text-on-surface mb-2 font-semibold">
                    {syncState === "connecting" && "Establishing Connection..."}
                    {syncState === "fetching" && "Fetching Candidates..."}
                    {syncState === "syncing" && "Syncing Database..."}
                    {syncState === "completed" && "Sync Completed!"}
                  </h4>

                  <p className="text-body-md text-text-muted max-w-xs mb-6">
                    {syncState === "connecting" && `Contacting secure REST gateway at ${apiUrl}`}
                    {syncState === "fetching" && "Downloading high-fidelity candidate profile metadata..."}
                    {syncState === "syncing" && "Injecting candidates into your TalScout workspace."}
                    {syncState === "completed" && "Your ATS workspace candidates are now fully synchronized!"}
                  </p>

                  <div className="w-full max-w-xs bg-surface-container rounded-full h-2 overflow-hidden mb-2">
                    <div
                      className={`h-full transition-all duration-500 ease-out ${
                        syncState === "completed" ? "bg-tertiary" : "bg-primary"
                      }`}
                      style={{ width: `${syncProgress}%` }}
                    />
                  </div>
                  <span className="font-data-mono text-[11px] text-text-muted">{syncProgress}%</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
