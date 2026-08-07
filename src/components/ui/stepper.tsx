"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small numbered step indicator — circle + checkmark-when-complete +
 * connector line. Componentized out of the blueprints "new" wizard, which
 * used to hand-roll this with a manual `STEPS.map` + `cn()` conditionals.
 */
export interface StepperProps {
  steps: readonly string[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="mb-10 flex items-center">
      {steps.map((label, i) => (
        <div key={label} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-label-md text-label-md transition-colors",
                i < currentStep
                  ? "bg-primary-container/20 text-primary"
                  : i === currentStep
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-container text-on-surface-variant",
              )}
            >
              {i < currentStep ? <Check className="size-[18px]" /> : i + 1}
            </div>
            <span
              className={cn(
                "font-label-md text-label-md whitespace-nowrap",
                i === currentStep ? "text-on-surface font-semibold" : "hidden text-text-muted sm:inline",
              )}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="relative mx-3 h-px flex-1 overflow-hidden rounded-full bg-border-low-alpha sm:mx-4">
              <motion.div
                className="absolute inset-y-0 left-0 bg-primary-container"
                initial={false}
                animate={{ width: i < currentStep ? "100%" : "0%" }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
