import { useState, useMemo } from "react";
import { useElection } from "@/hooks/use-election-data";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// Event types and their colors
const EVENT_COLORS = {
  registration: { bg: "bg-[#2563EB]/10", border: "border-[#2563EB]/30", text: "text-[#2563EB]", dot: "#2563EB" },
  approval: { bg: "bg-[#8B5CF6]/10", border: "border-[#8B5CF6]/30", text: "text-[#8B5CF6]", dot: "#8B5CF6" },
  campaign: { bg: "bg-[#F97316]/10", border: "border-[#F97316]/30", text: "text-[#F97316]", dot: "#F97316" },
  voting: { bg: "bg-[#0F8A5F]/10", border: "border-[#0F8A5F]/30", text: "text-[#0F8A5F]", dot: "#0F8A5F" },
  results: { bg: "bg-[#D9A441]/10", border: "border-[#D9A441]/30", text: "text-[#D9A441]", dot: "#D9A441" },
};

interface ElectionEvent {
  id: string;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  type: keyof typeof EVENT_COLORS;
  dateLabel: string;
}

export function ElectionCalendar() {
  const { data: election, isPending } = useElection();

  // Parse events dynamically from backend data
  const events = useMemo<ElectionEvent[]>(() => {
    if (!election) return [];

    const regStart = election.registration_start ? new Date(election.registration_start) : null;
    const regEnd = election.registration_end ? new Date(election.registration_end) : null;
    const docDeadline = election.document_deadline ? new Date(election.document_deadline) : null;
    const voteStart = election.voting_start ? new Date(election.voting_start) : null;
    const voteEnd = election.voting_end ? new Date(election.voting_end) : null;
    
    // Fallbacks if results published at is not available, check election.results_published_at
    const resultsPub = election.results_published_at 
      ? new Date(election.results_published_at) 
      : voteEnd 
        ? new Date(voteEnd.getTime() + 24 * 60 * 60 * 1000 * 2) // +2 days
        : null;

    const list: ElectionEvent[] = [];

    if (regStart) {
      list.push({
        id: "reg-start",
        title: "Registration Opens",
        startDate: regStart,
        endDate: regEnd,
        type: "registration",
        dateLabel: regStart.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      });
    }

    if (regEnd) {
      list.push({
        id: "reg-end",
        title: "Registration Closes",
        startDate: regEnd,
        endDate: null,
        type: "registration",
        dateLabel: regEnd.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      });
      
      list.push({
        id: "candidate-filing",
        title: "Candidate Filing Period",
        startDate: regStart,
        endDate: regEnd,
        type: "registration",
        dateLabel: `${regStart?.getDate() ?? ""} - ${regEnd.getDate()} ${regEnd.toLocaleDateString(undefined, { month: "short" })}`,
      });
    }

    if (regEnd && (docDeadline || voteStart)) {
      const startApproval = regEnd;
      const endApproval = docDeadline || voteStart;
      if (endApproval) {
        list.push({
          id: "candidate-approval",
          title: "Candidate Profile Review & Approval",
          startDate: startApproval,
          endDate: endApproval,
          type: "approval",
          dateLabel: `${startApproval.getDate()} - ${endApproval.getDate()} ${endApproval.toLocaleDateString(undefined, { month: "short" })}`,
        });
      }
    }

    if (docDeadline && voteStart) {
      list.push({
        id: "campaign-period",
        title: "Official Campaigning Starts",
        startDate: docDeadline,
        endDate: voteStart,
        type: "campaign",
        dateLabel: `${docDeadline.getDate()} - ${voteStart.getDate()} ${voteStart.toLocaleDateString(undefined, { month: "short" })}`,
      });
    }

    if (voteStart && voteEnd) {
      list.push({
        id: "voting-day",
        title: "Official Voting Period",
        startDate: voteStart,
        endDate: voteEnd,
        type: "voting",
        dateLabel: voteStart.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
      });
    }

    if (resultsPub) {
      list.push({
        id: "results-announcement",
        title: "Results Sealed & Published",
        startDate: resultsPub,
        endDate: null,
        type: "results",
        dateLabel: resultsPub.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
      });
    }

    return list;
  }, [election]);

  // Set default view date based on election voting dates (or current date)
  const defaultDate = useMemo(() => {
    if (election?.voting_start) {
      return new Date(election.voting_start);
    }
    return new Date();
  }, [election]);

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    // Default to the month of voting if it's set in the future or past
    if (election?.voting_start) {
      const vDate = new Date(election.voting_start);
      return new Date(vDate.getFullYear(), vDate.getMonth(), 1);
    }
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const monthYearLabel = currentMonth.toLocaleString(undefined, { month: "long", year: "numeric" });

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth((prev) => {
      const offset = direction === "prev" ? -1 : 1;
      return new Date(prev.getFullYear(), prev.getMonth() + offset, 1);
    });
  };

  // Generate days in grid
  const daysInGrid = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days: { date: Date | null; dayNum: number | null; isToday: boolean; events: ElectionEvent[] }[] = [];
    
    // Empty prefix cells
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ date: null, dayNum: null, isToday: false, events: [] });
    }

    // Month days
    const today = new Date();
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const isToday =
        today.getDate() === d &&
        today.getMonth() === month &&
        today.getFullYear() === year;

      // Filter events occurring on this date
      const dayEvents = events.filter((e) => {
        if (!e.startDate) return false;
        
        const start = new Date(e.startDate.getFullYear(), e.startDate.getMonth(), e.startDate.getDate());
        const target = new Date(year, month, d);

        if (e.endDate) {
          const end = new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate());
          return target >= start && target <= end;
        }
        return target.getTime() === start.getTime();
      });

      days.push({ date, dayNum: d, isToday, events: dayEvents });
    }

    return days;
  }, [currentMonth, events]);

  if (isPending) {
    return (
      <div className="bg-white rounded-3xl p-5 border border-[#E6ECE9] animate-pulse h-[350px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Clock className="h-5 w-5 animate-spin" />
          <span className="text-xs">Loading Calendar...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-5 border border-[#E6ECE9] shadow-sm flex flex-col space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[#0F8A5F]/10 flex items-center justify-center shrink-0">
            <CalendarIcon className="h-4 w-4 text-[#0F8A5F]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#102A27]">Election Schedule</h3>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Timeline & key dates</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateMonth("prev")}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors border border-[#E6ECE9]"
            aria-label="Previous Month"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-[#102A27]" />
          </button>
          <span className="text-xs font-bold text-[#102A27] px-2 min-w-[90px] text-center">
            {monthYearLabel}
          </span>
          <button
            onClick={() => navigateMonth("next")}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors border border-[#E6ECE9]"
            aria-label="Next Month"
          >
            <ChevronRight className="h-3.5 w-3.5 text-[#102A27]" />
          </button>
        </div>
      </div>

      {/* Weekdays Labels */}
      <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-[#E6ECE9] pb-1.5">
        <span>Su</span>
        <span>Mo</span>
        <span>Tu</span>
        <span>We</span>
        <span>Th</span>
        <span>Fr</span>
        <span>Sa</span>
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-y-1 gap-x-1.5 text-center">
        {daysInGrid.map((cell, idx) => {
          if (cell.dayNum === null) {
            return <div key={`empty-${idx}`} className="h-7" />;
          }

          const hasEvents = cell.events.length > 0;
          // Use primary event type if multiple
          const primaryEvent = cell.events[0];
          const colorSet = primaryEvent ? EVENT_COLORS[primaryEvent.type] : null;

          return (
            <div
              key={`day-${cell.dayNum}`}
              className={cn(
                "h-7 rounded-lg flex flex-col items-center justify-center text-xs relative font-medium group transition-all duration-150 border border-transparent cursor-pointer",
                cell.isToday && "bg-[#102A27] text-white font-bold",
                !cell.isToday && hasEvents && cn(colorSet?.bg, colorSet?.text, colorSet?.border, "font-semibold"),
                !cell.isToday && !hasEvents && "text-[#102A27] hover:bg-gray-100 hover:border-[#E6ECE9]"
              )}
              title={cell.events.map((e) => e.title).join(", ")}
            >
              {cell.dayNum}
              {hasEvents && !cell.isToday && (
                <span
                  className="absolute bottom-0.5 h-1 w-1 rounded-full"
                  style={{ backgroundColor: colorSet?.dot }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Events List */}
      <div className="space-y-2 border-t border-[#E6ECE9] pt-3 mt-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Key Milestones</p>
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
          {events.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-2">No dates configured.</div>
          ) : (
            events.map((e) => {
              const colorSet = EVENT_COLORS[e.type];
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between text-[11px] py-1 px-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: colorSet.dot }}
                    />
                    <span className="font-medium text-[#102A27] truncate leading-tight">
                      {e.title}
                    </span>
                  </div>
                  <span className={cn("text-[10px] font-bold shrink-0 ml-2", colorSet.text)}>
                    {e.dateLabel}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
