"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface PricingTier {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  buttonText: string;
  popular?: boolean;
}

export function PricingSection() {
  const [isYearly, setIsYearly] = useState(true);

  const pricingTiers: PricingTier[] = [
    {
      id: "free",
      name: "Free",
      description: "Perfect for getting started with Interview Studio.",
      monthlyPrice: 0,
      yearlyPrice: 0,
      features: [
        "Up to 3 participants",
        "30 minutes recording time",
        "HD video quality",
        "Basic export options",
        "Email support"
      ],
      buttonText: "Get Started"
    },
    {
      id: "plus",
      name: "Plus",
      description: "For content creators and small teams.",
      monthlyPrice: 14,
      yearlyPrice: 9,
      features: [
        "Up to 6 participants",
        "Unlimited recording time",
        "4K video quality",
        "All export formats",
        "AI noise reduction",
        "Priority support",
        "Cloud storage (100GB)"
      ],
      buttonText: "Get Plus",
      popular: true
    },
    {
      id: "pro",
      name: "Pro",
      description: "For professional teams and agencies.",
      monthlyPrice: 29,
      yearlyPrice: 19,
      features: [
        "Up to 8 participants",
        "Unlimited recording time",
        "4K video quality",
        "All export formats",
        "Advanced AI editing",
        "Custom branding",
        "Team collaboration",
        "Priority support",
        "Cloud storage (1TB)"
      ],
      buttonText: "Get Pro"
    }
  ];

  return (
    <section id="pricing" className="py-24 px-4">
      <div className="container mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-16 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-6 text-foreground">
            One tool for your interview recording needs
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground">
            Level up your interviews, podcasts, and video content with Interview Studio.
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <motion.div
          className="flex items-center justify-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="flex items-center space-x-4 bg-muted/50 p-2 rounded-lg">
            <span className={`text-sm font-medium ${!isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              className="relative w-12 h-6 bg-primary rounded-full transition-colors"
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  isYearly ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
            <div className="flex items-center space-x-2">
              <span className={`text-sm font-medium ${isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
                Yearly
              </span>
              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                Save up to 40%
              </span>
            </div>
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {pricingTiers.map((tier, index) => (
            <motion.div
              key={tier.id}
              className={`relative bg-card border rounded-2xl p-8 ${
                tier.popular
                  ? 'border-primary shadow-2xl shadow-primary/20 scale-105'
                  : 'border-border shadow-lg'
              }`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
            >
              {/* Popular Badge */}
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium">
                    Most Popular
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-foreground mb-2">
                  {tier.name}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {tier.description}
                </p>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-center justify-center mb-2">
                    <span className="text-5xl font-bold text-foreground">
                      €{isYearly ? tier.yearlyPrice : tier.monthlyPrice}
                    </span>
                    <span className="text-muted-foreground ml-2">
                      /month
                    </span>
                  </div>
                  {tier.yearlyPrice > 0 && (
                    <div className="text-sm text-muted-foreground">
                      {isYearly
                        ? "Per month billed yearly."
                        : "Billed monthly."
                      }
                    </div>
                  )}
                </div>

                {/* CTA Button */}
                <Button
                  size="lg"
                  variant={tier.popular ? "default" : "outline"}
                  className="w-full mb-8"
                >
                  {tier.buttonText}
                </Button>
              </div>

              {/* Features */}
              <div className="space-y-4">
                {tier.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center mt-0.5">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Additional Info */}
        <motion.div
          className="text-center mt-12 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <div className="bg-muted/50 rounded-lg p-6">
            <p className="text-sm text-muted-foreground mb-2">
              <strong>All plans include:</strong>
            </p>
            <p className="text-sm text-muted-foreground">
              No credit card required for Free plan. Cancel anytime.
              All prices are in EUR and exclude applicable taxes.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}