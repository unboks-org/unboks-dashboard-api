import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="w-full max-w-md"
      >
        <Card className="border-border bg-card shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-8 text-center flex flex-col items-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight mb-2">Page not found</h1>
            <p className="text-[14px] text-muted-foreground mb-8">
              The page you are looking for doesn't exist or has been moved.
            </p>
            <Link href="/" className="inline-flex items-center justify-center h-10 px-4 rounded-full bg-primary text-primary-foreground text-[14px] font-medium transition-transform active:scale-[0.97]">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Inbox
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
