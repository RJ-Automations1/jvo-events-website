import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { IS_WEDDINGS_SITE } from "@/lib/siteMode";
import Home from "@/pages/Home";
import Gallery from "@/pages/Gallery";
import Contact from "@/pages/Contact";
import Corporate from "@/pages/Corporate";
import Weddings from "@/pages/Weddings";
import Testimonials from "@/pages/Testimonials";
import Book from "@/pages/Book";
import Tour from "@/pages/Tour";
import NotFound from "@/pages/NotFound";
import ChatWidget from "@/components/ChatWidget";

/** Scroll to top on every route change. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  // Standalone JVO Weddings site: the weddings page IS the homepage, and only
  // wedding-relevant routes exist — anything else lands back on the homepage.
  if (IS_WEDDINGS_SITE) {
    return (
      <>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Weddings />} />
          <Route path="/book" element={<Book />} />
          <Route path="/tour" element={<Tour />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ChatWidget />
      </>
    );
  }

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/events" element={<Corporate />} />
        <Route path="/corporate" element={<Corporate />} />
        <Route path="/weddings" element={<Weddings />} />
        <Route path="/wedding" element={<Weddings />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/testimonials" element={<Testimonials />} />
        <Route path="/book" element={<Book />} />
        <Route path="/tour" element={<Tour />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ChatWidget />
    </>
  );
}
