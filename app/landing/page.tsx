import LandingHeader from "@/components/LandingHeader";

// Ordered image sections — each image spans 100vw with no gaps
const sections = [
  {
    id: "hero",
    src: "https://i.postimg.cc/P5ZL08CL/ajʿl-hdhh-alswrt-202604051156.jpg",
    alt: "SmartScout AI Hero — Intelligent Robot Dashboard",
  },
  {
    id: "stats",
    src: "https://i.postimg.cc/vBPD5rNW/Design-a-clean-202604051142-3.jpg",
    alt: "SmartScout Platform Stats & Numbers",
  },
  {
    id: "gmail-section",
    src: "https://i.postimg.cc/c4t688MF/SECTION-GMAIL-202604051141-2.jpg",
    alt: "Gmail Integration Section",
  },
  {
    id: "workflow-steps",
    src: "https://i.postimg.cc/pV4LxLbX/Design-a-clean-202604051141-4.jpg",
    alt: "How SmartScout Works — Step by Step",
  },
  {
    id: "features-cta",
    src: "https://i.postimg.cc/fbCbh7Ds/Design-a-clean-202604051141-5.jpg",
    alt: "SmartScout Features & Call to Action",
  },
];

export default function LandingPage() {
  return (
    <>
      <LandingHeader />

      {/* Offset for fixed header */}
      <main className="landing-main">
        {sections.map(({ id, src, alt }) => (
          <section key={id} id={id} className="landing-section">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="landing-section-img"
              loading={id === "hero" ? "eager" : "lazy"}
              draggable={false}
            />
          </section>
        ))}
      </main>
    </>
  );
}
