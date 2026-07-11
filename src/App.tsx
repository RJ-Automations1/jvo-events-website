import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Home from "@/pages/Home";
import Gallery from "@/pages/Gallery";
import Contact from "@/pages/Contact";
import Corporate from "@/pages/Corporate";
import Testimonials from "@/pages/Testimonials";
import Book from "@/pages/Book";
import Tour from "@/pages/Tour";
import NotFound from "@/pages/NotFound";
import { CbeAuthProvider } from "@/lib/cbe/auth";
import CbeLogin from "@/pages/cbe/Login";
import CbeDashboard from "@/pages/cbe/Dashboard";
import NewVendor from "@/pages/cbe/NewVendor";
import ReturningVendor from "@/pages/cbe/ReturningVendor";
import VendorDetail from "@/pages/cbe/VendorDetail";
import "@/lib/cbe/cbe.css";

/** Scroll to top on every route change. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/events" element={<Corporate />} />
        <Route path="/corporate" element={<Corporate />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/testimonials" element={<Testimonials />} />
        <Route path="/book" element={<Book />} />
        <Route path="/tour" element={<Tour />} />

        {/* CBE Vendor Onboarding & Payment Tracking Platform (internal) */}
        <Route
          path="/cbe/*"
          element={
            <CbeAuthProvider>
              <Routes>
                <Route path="login" element={<CbeLogin />} />
                <Route index element={<CbeDashboard />} />
                <Route path="vendors/new" element={<NewVendor />} />
                <Route path="vendors/:id" element={<VendorDetail />} />
                <Route path="returning" element={<ReturningVendor />} />
                <Route path="*" element={<CbeDashboard />} />
              </Routes>
            </CbeAuthProvider>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
