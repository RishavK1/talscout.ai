import Link from "next/link";

export default function ReviewExtractionPage() {
  return (
    <div className="antialiased min-h-screen flex flex-col font-body-md text-body-md">
      {/* TopAppBar */}
      <header className="sticky top-0 z-40 bg-surface/80 dark:bg-surface-container/80 backdrop-blur-md border-b border-border-low-alpha">
        <div className="flex flex-wrap justify-between items-center gap-3 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              className="text-on-surface-variant hover:bg-surface-container-low p-2 rounded-full transition-colors flex items-center justify-center"
              href="/upload"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <h1 className="font-headline-md text-headline-md text-primary">Review AI Extraction</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-on-surface-variant hover:bg-surface-container-low p-2 rounded-full transition-colors flex items-center justify-center"
            >
              <span className="material-symbols-outlined">history</span>
            </button>
            <button
              type="button"
              className="text-on-surface-variant hover:bg-surface-container-low p-2 rounded-full transition-colors flex items-center justify-center relative"
            >
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area: Split Pane */}
      <main className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden">
        {/* Left Pane: Document Viewer */}
        <section className="w-full lg:w-1/2 min-h-[60vh] lg:h-[calc(100vh-73px-80px)] border-b lg:border-b-0 lg:border-r border-border-low-alpha bg-surface-container-lowest overflow-hidden flex flex-col relative">
          {/* Toolbar for PDF */}
          <div className="h-12 border-b border-border-low-alpha bg-surface-container-low flex items-center justify-between px-4 shrink-0">
            <span className="font-label-md text-label-md text-on-surface-variant">smith_resume_2024.pdf</span>
            <div className="flex gap-2">
              <button type="button" className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">zoom_out</span>
              </button>
              <span className="font-data-mono text-data-mono text-on-surface-variant self-center">100%</span>
              <button type="button" className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">zoom_in</span>
              </button>
            </div>
          </div>
          {/* Mock PDF Content Area */}
          <div className="flex-1 overflow-auto p-8 bg-surface-container-low flex justify-center">
            <div className="w-full max-w-[800px] h-fit bg-surface-white shadow-sm border border-border-low-alpha p-12 flex flex-col gap-8 relative">
              {/* AI Highlight Overlay Example */}
              <div className="absolute top-[80px] left-[48px] w-[200px] h-[32px] bg-tertiary-fixed/30 border border-tertiary-fixed rounded pointer-events-none"></div>
              {/* Resume Content Mockup */}
              <div className="border-b pb-4 border-border-low-alpha">
                <h2 className="text-2xl font-bold font-serif mb-1">Alexandria Smith</h2>
                <p className="text-sm text-text-muted">
                  Software Engineer | San Francisco, CA | a.smith@example.com | (555) 123-4567
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold border-b mb-2">Experience</h3>
                <div className="mb-4">
                  <div className="flex justify-between font-medium">
                    <span>Senior Frontend Developer - TechCorp</span>
                    <span>2020 - Present</span>
                  </div>
                  <ul className="list-disc pl-5 text-sm mt-2 space-y-1 text-on-surface-variant">
                    <li>Led the development of a scalable component library using React and TypeScript.</li>
                    <li>Improved application load time by 40% through code splitting and lazy loading.</li>
                    <li>Mentored 3 junior developers and established code review best practices.</li>
                  </ul>
                </div>
                <div>
                  <div className="flex justify-between font-medium">
                    <span>Web Developer - StartupInc</span>
                    <span>2018 - 2020</span>
                  </div>
                  <ul className="list-disc pl-5 text-sm mt-2 space-y-1 text-on-surface-variant">
                    <li>Developed responsive landing pages resulting in a 25% increase in conversion rate.</li>
                    <li>Integrated RESTful APIs for real-time data visualization.</li>
                  </ul>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold border-b mb-2">Skills</h3>
                <p className="text-sm text-on-surface-variant">
                  JavaScript, TypeScript, React, Vue.js, Node.js, CSS/SASS, HTML5, Git, Webpack, Agile/Scrum.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Pane: Editable Form */}
        <section className="w-full lg:w-1/2 min-h-[60vh] lg:h-[calc(100vh-73px-80px)] bg-bg-cream overflow-y-auto relative pb-24">
          <div className="p-8 max-w-3xl mx-auto space-y-8">
            {/* Header & AI Badge */}
            <div className="flex justify-between items-start">
              <div>
                <h2 className="font-headline-md text-headline-md text-primary mb-1">Extracted Candidate Profile</h2>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Review and edit the data parsed by TalScout AI.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 bg-secondary-fixed/20 border border-secondary-fixed rounded-full px-3 py-1">
                <span className="material-symbols-outlined text-secondary text-[16px]">smart_toy</span>
                <span className="font-label-md text-label-md text-on-secondary-container">AI-Parsed</span>
                <span className="font-data-mono text-data-mono text-secondary ml-1 font-semibold">98% Match</span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-6">
              {/* Personal Info Card */}
              <div className="bg-surface-white rounded-lg shadow-sm p-6 border border-border-low-alpha">
                <h3 className="font-label-md text-label-md text-primary mb-4 border-b border-border-low-alpha pb-2">
                  Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block font-label-md text-label-md text-on-surface mb-1">Full Name</label>
                    <input
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 font-body-md text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-shadow"
                      type="text"
                      defaultValue="Alexandria Smith"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface mb-1">Email</label>
                    <input
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 font-body-md text-body-md focus:outline-none focus:border-primary transition-shadow"
                      type="email"
                      defaultValue="a.smith@example.com"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface mb-1">Phone</label>
                    <input
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 font-body-md text-body-md focus:outline-none focus:border-primary transition-shadow"
                      type="tel"
                      defaultValue="(555) 123-4567"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block font-label-md text-label-md text-on-surface mb-1">Location</label>
                    <input
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 font-body-md text-body-md focus:outline-none focus:border-primary transition-shadow"
                      type="text"
                      defaultValue="San Francisco, CA"
                    />
                  </div>
                </div>
              </div>

              {/* Experience Card */}
              <div className="bg-surface-white rounded-lg shadow-sm p-6 border border-border-low-alpha">
                <div className="flex justify-between items-center mb-4 border-b border-border-low-alpha pb-2">
                  <h3 className="font-label-md text-label-md text-primary">Experience</h3>
                  <button
                    type="button"
                    className="text-primary hover:text-primary-container font-label-md text-label-md flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span> Add Entry
                  </button>
                </div>
                <div className="space-y-4">
                  {/* Exp Item 1 */}
                  <div className="border border-border-low-alpha rounded p-4 relative group">
                    <button
                      type="button"
                      className="absolute top-2 right-2 text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="col-span-2">
                        <label className="block font-label-md text-label-md text-on-surface mb-1 text-xs text-text-muted">
                          Job Title
                        </label>
                        <input
                          className="w-full bg-transparent border-b border-outline-variant py-1 font-body-md text-body-md focus:outline-none focus:border-primary"
                          type="text"
                          defaultValue="Senior Frontend Developer"
                        />
                      </div>
                      <div>
                        <label className="block font-label-md text-label-md text-on-surface mb-1 text-xs text-text-muted">
                          Company
                        </label>
                        <input
                          className="w-full bg-transparent border-b border-outline-variant py-1 font-body-md text-body-md focus:outline-none focus:border-primary"
                          type="text"
                          defaultValue="TechCorp"
                        />
                      </div>
                      <div>
                        <label className="block font-label-md text-label-md text-on-surface mb-1 text-xs text-text-muted">
                          Dates
                        </label>
                        <input
                          className="w-full bg-transparent border-b border-outline-variant py-1 font-body-md text-body-md focus:outline-none focus:border-primary"
                          type="text"
                          defaultValue="2020 - Present"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-label-md text-label-md text-on-surface mb-1 text-xs text-text-muted">
                        Description
                      </label>
                      <textarea
                        className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 font-body-md text-body-md text-sm focus:outline-none focus:border-primary resize-none"
                        rows={3}
                        defaultValue="Led the development of a scalable component library using React and TypeScript. Improved application load time by 40% through code splitting and lazy loading. Mentored 3 junior developers and established code review best practices."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Skills Card (Chips) */}
              <div className="bg-surface-white rounded-lg shadow-sm p-6 border border-border-low-alpha">
                <h3 className="font-label-md text-label-md text-primary mb-4 border-b border-border-low-alpha pb-2">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {/* Semantic Highlight Example for Skills */}
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-secondary-fixed/30 text-on-secondary-container font-label-md text-label-md border border-secondary-fixed">
                    React{" "}
                    <button type="button" className="ml-2 hover:text-error">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-secondary-fixed/30 text-on-secondary-container font-label-md text-label-md border border-secondary-fixed">
                    TypeScript{" "}
                    <button type="button" className="ml-2 hover:text-error">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface-container border border-outline-variant text-on-surface font-label-md text-label-md">
                    JavaScript{" "}
                    <button type="button" className="ml-2 hover:text-error">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface-container border border-outline-variant text-on-surface font-label-md text-label-md">
                    Node.js{" "}
                    <button type="button" className="ml-2 hover:text-error">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Action Bar */}
          <div className="absolute bottom-0 w-full bg-surface/90 backdrop-blur-md border-t border-border-low-alpha p-4 sm:px-8 flex flex-wrap justify-between items-center gap-3 z-10 shadow-[0_-4px_20px_rgba(44,35,34,0.05)]">
            <button
              type="button"
              className="font-label-md text-label-md text-on-surface hover:text-primary border border-outline-variant rounded px-6 py-2 transition-colors flex items-center gap-2 bg-surface-white"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span> Re-run Extraction
            </button>
            <div className="flex gap-4">
              <button
                type="button"
                className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface px-4 py-2 transition-colors"
              >
                Cancel
              </button>
              <Link
                href="/candidates"
                className="font-label-md text-label-md bg-primary text-on-primary rounded px-8 py-2 hover:bg-primary-container transition-colors shadow-sm"
              >
                Approve &amp; Save
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
