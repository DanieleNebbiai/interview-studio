"use client";

import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Menu,
  X,
  ChevronDown,
  Plus,
  PlaySquare,
  LogOut,
} from "lucide-react";
import { User } from "@/types/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface HeaderProps {
  user: User | null;
  onSignOut: () => void;
  onShowAuthModal: () => void;
  onCreateNewRoom?: () => void;
}

export function Header({
  user,
  onSignOut,
  onShowAuthModal,
  onCreateNewRoom,
}: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const toggleMenu = () => setIsOpen(!isOpen);

  const handleNewRoom = () => {
    onCreateNewRoom?.();
  };

  const handleRecordings = () => {
    router.push("/recordings");
  };

  return (
    <nav className="sticky top-0 z-50 w-full px-4 py-6 bg-background/80 backdrop-blur-xl border-b border-border/20">
      <div className="container mx-auto">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <motion.a
              href="/"
              className="flex items-center"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="w-8 h-8 mr-3"
                animate={{ rotate: 360 }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "linear"
                }}
              >
                <Image
                  src="/logo.png"
                  alt="Interview Studio Logo"
                  width={32}
                  height={32}
                  className="w-full h-full object-contain"
                />
              </motion.div>
              <span className="text-xl font-bold text-white">
                Interview Studio
              </span>
            </motion.a>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {[
              { label: "Product", href: "#", disabled: true },
              { label: "Help", href: "#", disabled: true },
              { label: "Pricing", href: "/#pricing" },
              { label: "About", href: "/about" },
            ].map((item) => (
              <motion.div
                key={item.label}
                className={item.disabled ? "cursor-default" : "cursor-pointer"}
                whileHover={item.disabled ? {} : { scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <div className="relative">
                  {item.disabled ? (
                    <span className="text-sm text-gray-400 font-medium opacity-60">
                      {item.label}
                    </span>
                  ) : (
                    <a
                      href={item.href}
                      className="text-sm text-gray-300 hover:text-white transition-colors font-medium"
                    >
                      {item.label}
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* CTA Button */}
          <div className="hidden md:block">
            {user ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-300">
                  Ciao, {user.name?.split(" ")[0] || user.email?.split("@")[0]}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <motion.button
                      className="inline-flex items-center justify-center px-4 py-2 text-sm text-white hover:underline rounded-lg transition-all duration-200 font-medium"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Menu
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </motion.button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={handleNewRoom}>
                      <Plus className="mr-2 h-4 w-4" />
                      New Interview Room
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleRecordings}>
                      <PlaySquare className="mr-2 h-4 w-4" />
                      Recordings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Esci
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <motion.button
                onClick={onShowAuthModal}
                className="inline-flex items-center justify-center px-6 py-2.5 text-sm text-white bg-primary hover:bg-primary/90 rounded-lg transition-all duration-200 font-semibold shadow-lg hover:shadow-xl"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Get Started
              </motion.button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <motion.button
            className="md:hidden flex items-center"
            onClick={toggleMenu}
            whileTap={{ scale: 0.9 }}
          >
            <Menu className="h-6 w-6 text-gray-300" />
          </motion.button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-background z-50 pt-24 px-6 md:hidden"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <motion.button
              className="absolute top-6 right-6 p-2"
              onClick={toggleMenu}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <X className="h-6 w-6 text-gray-300" />
            </motion.button>

            <div className="flex flex-col space-y-6">
              {[
                { label: "Product", href: "#", disabled: true },
                { label: "Help", href: "#", disabled: true },
                { label: "Pricing", href: "/#pricing" },
                { label: "About", href: "/about" },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 + 0.1 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  {item.disabled ? (
                    <span className="text-base text-gray-500 font-medium">
                      {item.label}
                    </span>
                  ) : (
                    <a
                      href={item.href}
                      className="text-base text-gray-300 font-medium"
                      onClick={toggleMenu}
                    >
                      {item.label}
                    </a>
                  )}
                </motion.div>
              ))}

              {/* Mobile Auth Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                exit={{ opacity: 0, y: 20 }}
                className="pt-6 space-y-4"
              >
                {user ? (
                  <>
                    <div className="text-base text-gray-300 mb-4">
                      Ciao, {user.name || user.email}
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          handleNewRoom();
                          toggleMenu();
                        }}
                        className="inline-flex items-center justify-center w-full px-5 py-3 text-base text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        New Interview Room
                      </button>
                      <button
                        onClick={() => {
                          handleRecordings();
                          toggleMenu();
                        }}
                        className="inline-flex items-center justify-center w-full px-5 py-3 text-base text-gray-300 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
                      >
                        <PlaySquare className="mr-2 h-4 w-4" />
                        Recordings
                      </button>
                      <button
                        onClick={() => {
                          onSignOut();
                          toggleMenu();
                        }}
                        className="inline-flex items-center justify-center w-full px-5 py-3 text-base text-gray-300 border border-border rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Esci
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      onShowAuthModal();
                      toggleMenu();
                    }}
                    className="inline-flex items-center justify-center w-full px-5 py-3 text-base text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Get Started
                  </button>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
