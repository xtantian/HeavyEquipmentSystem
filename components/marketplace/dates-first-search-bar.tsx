"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format, isBefore, startOfToday } from "date-fns";
import {
  Calendar as CalendarIcon,
  Search,
  Sparkles,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MARKETPLACE_CATEGORIES, searchBarSchema } from "@/lib/marketplace/categories";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface DatesFirstSearchBarProps {
  categories?: CategoryOption[];
}

export function DatesFirstSearchBar({ categories }: DatesFirstSearchBarProps) {
  const router = useRouter();
  const today = React.useMemo(() => startOfToday(), []);

  const availableCategories =
    categories && categories.length > 0 ? categories : MARKETPLACE_CATEGORIES;

  const [what, setWhat] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState("");
  const [startDate, setStartDate] = React.useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = React.useState<Date | undefined>(undefined);
  const [dateError, setDateError] = React.useState<string | null>(null);

  const [startOpen, setStartOpen] = React.useState(false);
  const [endOpen, setEndOpen] = React.useState(false);

  const handleStartDateSelect = (date: Date | undefined) => {
    setStartDate(date);
    setDateError(null);
    setStartOpen(false);

    if (date && endDate && isBefore(endDate, date)) {
      setEndDate(undefined);
    }
    if (date && !endDate) {
      setTimeout(() => setEndOpen(true), 150);
    }
  };

  const handleEndDateSelect = (date: Date | undefined) => {
    if (date && startDate && isBefore(date, startDate)) {
      setDateError("End date must be on or after start date");
      return;
    }
    setEndDate(date);
    setDateError(null);
    setEndOpen(false);
  };

  const handleClearDates = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStartDate(undefined);
    setEndDate(undefined);
    setDateError(null);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    const formValues = {
      what: what.trim() || undefined,
      category: selectedCategory || undefined,
      startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
      endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
    };

    const validation = searchBarSchema.safeParse(formValues);
    if (!validation.success) {
      const issue = validation.error.issues[0]?.message;
      setDateError(issue || "Invalid date range");
      return;
    }

    const params = new URLSearchParams();
    if (formValues.what) params.set("q", formValues.what);
    if (formValues.category) params.set("category", formValues.category);
    if (formValues.startDate) params.set("start", formValues.startDate);
    if (formValues.endDate) params.set("end", formValues.endDate);

    router.push(`/listings?${params.toString()}`);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <form
        onSubmit={handleSearch}
        className="relative rounded-2xl sm:rounded-3xl border border-zinc-200/90 bg-white p-3 sm:p-4 shadow-2xl transition-all text-left"
      >
        {/* Main Search Controls Container */}
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12 md:items-center">
          {/* 1. DATES SECTION (Columns 1-6) */}
          <div className="grid grid-cols-2 gap-2 md:col-span-6 bg-zinc-50/90 p-1.5 rounded-xl border border-zinc-200/90">
            {/* Start Date */}
            <Popover open={startOpen} onOpenChange={setStartOpen}>
              <PopoverTrigger
                type="button"
                className="flex flex-col items-start justify-center rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary w-full cursor-pointer"
              >
                <span className="text-[10px] font-bold tracking-wider uppercase text-amber-600">
                  Rental Start
                </span>
                <div className="flex items-center gap-1.5 mt-0.5 text-zinc-900">
                  <CalendarIcon className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold truncate">
                    {startDate ? format(startDate, "MMM dd, yyyy") : "Pick start date"}
                  </span>
                </div>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 bg-white border-zinc-200 text-zinc-900 z-50 shadow-2xl"
                align="start"
              >
                <div className="p-3 border-b border-zinc-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-800">Select Start Date</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-zinc-500 hover:text-zinc-900"
                    onClick={() => handleStartDateSelect(today)}
                  >
                    Today
                  </Button>
                </div>
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={handleStartDateSelect}
                  disabled={(date) => isBefore(date, today)}
                  autoFocus
                />
              </PopoverContent>
            </Popover>

            {/* End Date */}
            <Popover open={endOpen} onOpenChange={setEndOpen}>
              <PopoverTrigger
                type="button"
                className="flex flex-col items-start justify-center rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary w-full cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-amber-600">
                    Rental End
                  </span>
                  {(startDate || endDate) && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={handleClearDates}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleClearDates(e as unknown as React.MouseEvent);
                        }
                      }}
                      className="text-zinc-400 hover:text-zinc-700 transition-colors p-0.5 rounded cursor-pointer"
                      title="Clear dates"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-zinc-900">
                  <CalendarIcon className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold truncate">
                    {endDate ? format(endDate, "MMM dd, yyyy") : "Pick end date"}
                  </span>
                </div>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 bg-white border-zinc-200 text-zinc-900 z-50 shadow-2xl"
                align="start"
              >
                <div className="p-3 border-b border-zinc-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-800">Select End Date</span>
                  {startDate && (
                    <span className="text-[11px] text-amber-600 font-medium">
                      From {format(startDate, "MMM dd")}
                    </span>
                  )}
                </div>
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={handleEndDateSelect}
                  disabled={(date) => isBefore(date, startDate || today)}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* 2. CATEGORY & KEYWORD SECTION (Columns 7-10) */}
          <div className="flex flex-col sm:flex-row items-center gap-2 md:col-span-4 bg-zinc-50/90 p-1.5 rounded-xl border border-zinc-200/90">
            {/* Category Dropdown */}
            <div className="relative w-full sm:w-auto shrink-0">
              <select
                aria-label="Filter by category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-10 w-full sm:w-[130px] rounded-lg bg-white px-2.5 text-xs font-semibold text-zinc-900 border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              >
                <option value="">All Categories</option>
                {availableCategories.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Keyword Input */}
            <div className="relative w-full flex-1">
              <input
                type="text"
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                placeholder="What to rent? (e.g. CAT 320, Tesla, Sony FX3)"
                className="h-10 w-full bg-transparent px-2 text-xs sm:text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              >
              </input>
            </div>
          </div>

          {/* 3. SEARCH BUTTON (Columns 11-12) */}
          <div className="md:col-span-2">
            <Button
              type="submit"
              size="lg"
              className="w-full h-11 sm:h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/25 transition-all rounded-xl text-sm sm:text-base"
            >
              <Search className="mr-1.5 h-4 w-4" />
              <span>Search</span>
            </Button>
          </div>
        </div>

        {/* Validation Error Message */}
        {dateError && (
          <div className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{dateError}</span>
          </div>
        )}

        {/* Quick Suggestion Pills */}
        <div className="mt-3 hidden sm:flex items-center gap-2 px-1 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1 font-semibold text-zinc-400">
            <Sparkles className="h-3 w-3 text-amber-500" />
            Popular:
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("heavy-equipment");
              setWhat("Excavator");
            }}
            className="rounded-md bg-zinc-100 px-2 py-0.5 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 transition-colors font-medium"
          >
            Excavator
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("cars");
              setWhat("Tesla");
            }}
            className="rounded-md bg-zinc-100 px-2 py-0.5 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 transition-colors font-medium"
          >
            Electric SUV
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("cameras");
              setWhat("Sony FX3");
            }}
            className="rounded-md bg-zinc-100 px-2 py-0.5 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 transition-colors font-medium"
          >
            Cinema Camera
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("generators");
              setWhat("50kVA");
            }}
            className="rounded-md bg-zinc-100 px-2 py-0.5 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 transition-colors font-medium"
          >
            Silent Generator
          </button>
        </div>
      </form>
    </div>
  );
}
