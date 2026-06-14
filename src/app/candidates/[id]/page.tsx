import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { MessageCandidate } from "@/components/candidate/message-candidate";
import { EditProfile } from "@/components/candidate/edit-profile";
import { AddToShortlistButton } from "@/components/candidate/add-to-shortlist-button";
import { DownloadPdfButton } from "@/components/candidate/download-pdf-button";

export default function CandidateProfilePage() {
  return (
    <AppShell>
      {/* Main Content Area */}
      <main className="font-body-md text-body-md bg-bg-cream flex flex-1 flex-col min-h-screen selection:bg-tertiary-fixed selection:text-on-tertiary-fixed">
        {/* TopAppBar */}
        <header className="sticky top-0 z-40 bg-surface/80 dark:bg-surface-container/80 backdrop-blur-md flex flex-wrap gap-3 justify-between items-center px-4 sm:px-6 py-4 border-b border-border-low-alpha">
          <div className="flex items-center text-on-surface-variant">
            <Link className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-on-surface-variant" href="/candidates">
              <span className="material-symbols-outlined" data-icon="arrow_back">arrow_back</span>
            </Link>
            <div className="h-4 w-px bg-border-low-alpha mx-4"></div>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-outline">search</span>
              <input className="pl-10 pr-4 py-2 rounded-full bg-surface-white border border-border-low-alpha focus:outline-none focus:ring-1 focus:ring-primary w-full sm:w-64 font-body-md text-body-md shadow-sm transition-all sm:focus:w-80 placeholder:text-outline" placeholder="Search profiles..." type="text" />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button type="button" className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-on-surface-variant">
              <span className="material-symbols-outlined" data-icon="history">history</span>
            </button>
            <button type="button" className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-on-surface-variant">
              <span className="material-symbols-outlined" data-icon="notifications">notifications</span>
            </button>
            <Link className="px-4 py-2 bg-surface-white border border-border-low-alpha rounded-full font-label-md text-label-md text-primary hover:bg-surface-container-low shadow-sm transition-colors flex items-center space-x-2" href="/upload">
              <span>+ Upload résumés</span>
            </Link>
          </div>
        </header>
        {/* Breadcrumb */}
        <div className="px-4 sm:px-6 lg:px-12 pt-6 max-w-[1440px] mx-auto w-full">
          <nav className="flex items-center space-x-2 font-label-md text-label-md text-on-surface-variant">
            <Link className="hover:text-primary transition-colors" href="/candidates">Candidates</Link>
            <span className="material-symbols-outlined text-[18px] text-outline">chevron_right</span>
            <span className="text-primary font-semibold">Elena Rodriguez</span>
          </nav>
        </div>
        {/* Profile Canvas */}
        <div className="flex-1 p-4 sm:p-6 lg:p-12 max-w-[1440px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Main Profile (8 cols) */}
          <div className="lg:col-span-8 space-y-8">
            {/* Header Card */}
            <div className="glass-card rounded-xl p-8 flex flex-col md:flex-row gap-8 items-start relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-tertiary-fixed/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
              <div className="w-32 h-32 rounded-full flex items-center justify-center border-4 border-surface-white ambient-shadow z-10 shrink-0 bg-surface-container-high text-primary font-headline-lg text-headline-lg">
                ER
              </div>
              <div className="flex-1 z-10">
                <div className="flex items-center space-x-3 mb-2">
                  <h2 className="font-headline-lg text-headline-lg text-primary">Elena Rodriguez</h2>
                  <span className="px-2 py-1 bg-tertiary-fixed/30 text-on-tertiary-fixed-variant rounded-md font-label-md text-[12px] flex items-center shadow-sm">
                    <span className="material-symbols-outlined text-[14px] mr-1" data-icon="verified">verified</span> AI Match: 94%
                  </span>
                </div>
                <p className="font-body-lg text-body-lg text-on-surface-variant mb-4">Senior Product Designer specializing in Design Systems &amp; AI UX</p>
                <div className="flex flex-wrap gap-4 font-label-md text-label-md text-outline">
                  <div className="flex items-center">
                    <span className="material-symbols-outlined text-[18px] mr-1.5" data-icon="location_on">location_on</span>
                    San Francisco, CA (Open to Remote)
                  </div>
                  <div className="flex items-center">
                    <span className="material-symbols-outlined text-[18px] mr-1.5" data-icon="work">work</span>
                    8+ Years Experience
                  </div>
                  <div className="flex items-center">
                    <span className="material-symbols-outlined text-[18px] mr-1.5" data-icon="mail">mail</span>
                    elena.rodriguez@example.com
                  </div>
                </div>
              </div>
            </div>
            {/* AI Summary */}
            <div className="glass-card rounded-xl p-8">
              <h3 className="font-headline-md text-headline-md text-primary mb-4 flex items-center">
                <span className="material-symbols-outlined mr-2 text-tertiary-fixed-dim" data-icon="auto_awesome">auto_awesome</span>
                Executive Summary
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Elena is a highly analytical product designer with a proven track record of scaling design systems at enterprise SaaS companies. Her recent work integrating conversational UI patterns into complex workflows makes her a <span className="bg-secondary-fixed/40 px-1 rounded text-on-secondary-fixed">strong semantic match</span> for the open Lead Product Designer role. She demonstrates exceptional cross-functional leadership and a nuanced understanding of accessibility standards.
              </p>
            </div>
            {/* Experience Timeline */}
            <div className="glass-card rounded-xl p-8">
              <h3 className="font-headline-md text-headline-md text-primary mb-6">Experience</h3>
              <div className="space-y-8 relative">
                {/* Role 1 */}
                <div className="timeline-item relative pl-8">
                  <div className="timeline-line absolute left-0 top-0 h-full w-6 flex justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary mt-2 border-2 border-surface-white ring-2 ring-primary-fixed z-10"></div>
                  </div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-label-md text-[16px] text-on-surface font-semibold">Staff Product Designer</h4>
                      <p className="font-body-md text-[14px] text-outline">TechNova Solutions</p>
                    </div>
                    <span className="font-data-mono text-data-mono text-outline">2021 - Present</span>
                  </div>
                  <ul className="list-disc list-inside font-body-md text-[14px] text-on-surface-variant space-y-1.5 ml-1 marker:text-outline-variant">
                    <li>Led the complete overhaul of the enterprise design system, reducing design-to-dev handoff time by 40%.</li>
                    <li>Mentored a team of 4 junior designers, establishing a new critique framework.</li>
                    <li>Designed the <span className="bg-secondary-fixed/40 px-1 rounded text-on-secondary-fixed">core AI chat interface</span> that increased user engagement by 22% in Q3.</li>
                  </ul>
                </div>
                {/* Role 2 */}
                <div className="timeline-item relative pl-8">
                  <div className="timeline-line absolute left-0 top-0 h-full w-6 flex justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-surface-tint mt-2 border-2 border-surface-white z-10"></div>
                  </div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-label-md text-[16px] text-on-surface font-semibold">Senior UX Designer</h4>
                      <p className="font-body-md text-[14px] text-outline">CreativeCloud Inc.</p>
                    </div>
                    <span className="font-data-mono text-data-mono text-outline">2018 - 2021</span>
                  </div>
                  <ul className="list-disc list-inside font-body-md text-[14px] text-on-surface-variant space-y-1.5 ml-1 marker:text-outline-variant">
                    <li>Spearheaded user research initiatives for the flagship analytics dashboard.</li>
                    <li>Collaborated closely with engineering to implement accessible, WCAG AA compliant components.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          {/* Right Column: Sidebar Actions (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Primary Actions */}
            <div className="glass-card rounded-xl p-6 flex flex-col gap-3">
              <AddToShortlistButton name="Elena Rodriguez" />
              <MessageCandidate
                name="Elena Rodriguez"
                email="elena.rodriguez@example.com"
              />
              <div className="flex gap-3 mt-2">
                <DownloadPdfButton />
                <EditProfile />
              </div>
            </div>
            {/* Status & Details */}
            <div className="glass-card rounded-xl p-6">
              <h4 className="font-label-md text-label-md text-outline mb-4 uppercase tracking-wider text-[12px]">Profile Details</h4>
              <div className="space-y-4">
                <div>
                  <span className="block font-label-md text-[12px] text-outline mb-1">Current Status</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-secondary-fixed/30 text-on-secondary-fixed font-label-md text-[13px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-secondary mr-2"></div>
                    Interviewing
                  </span>
                </div>
                <div className="h-px w-full bg-border-low-alpha"></div>
                <div>
                  <span className="block font-label-md text-[12px] text-outline mb-1">Source</span>
                  <span className="font-body-md text-[14px] text-on-surface">LinkedIn Sourcing (Oct 12)</span>
                </div>
                <div className="h-px w-full bg-border-low-alpha"></div>
                <div>
                  <span className="block font-label-md text-[12px] text-outline mb-1">Salary Expectation</span>
                  <span className="font-data-mono text-data-mono text-on-surface">$160k - $180k</span>
                </div>
              </div>
            </div>
            {/* Skills */}
            <div className="glass-card rounded-xl p-6">
              <h4 className="font-label-md text-label-md text-outline mb-4 uppercase tracking-wider text-[12px]">Top Skills</h4>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-surface-container-high rounded-full font-label-md text-[13px] text-on-surface-variant border border-border-low-alpha">Design Systems</span>
                <span className="px-3 py-1 bg-surface-container-high rounded-full font-label-md text-[13px] text-on-surface-variant border border-border-low-alpha">Figma</span>
                <span className="px-3 py-1 bg-surface-container-high rounded-full font-label-md text-[13px] text-on-surface-variant border border-border-low-alpha">User Research</span>
                <span className="px-3 py-1 bg-tertiary-fixed/20 rounded-full font-label-md text-[13px] text-on-tertiary-fixed border border-tertiary-fixed/30">AI UX</span>
                <span className="px-3 py-1 bg-surface-container-high rounded-full font-label-md text-[13px] text-on-surface-variant border border-border-low-alpha">Prototyping</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
