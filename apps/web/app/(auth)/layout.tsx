import { cn } from "@/lib/utils";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-void p-4">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -left-64 -top-64 h-[600px] w-[600px] rounded-full bg-violet/[0.06] blur-[120px]" />
                <div className="absolute -bottom-64 -right-64 h-[600px] w-[600px] rounded-full bg-cyan/[0.04] blur-[120px]" />
            </div>
            <div className="relative w-full max-w-[400px]">{children}</div>
        </div>
    );
}
