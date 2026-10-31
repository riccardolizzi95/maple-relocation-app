import { createClient } from "@/lib/supabase/server";
import { cn, formatCAD } from "@/lib/utils";
import { addMonthsKey, daysUntil, formatDate, monthStartKey } from "@/lib/dates";
import { serverTodayKey } from "@/lib/timezone-server";
import Link from "next/link";
import {
  Plane,
  MapPin,
  ListChecks,
  Home,
  Briefcase,
  Wallet,
  FileText,
  Sparkles,
  StickyNote,
  ArrowRight,
  TrendingUp,
  CalendarClock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const moduleCards = [
  { href: "/checklist", label: "Checklist", Icon: ListChecks, desc: "Task e scadenze" },
  { href: "/housing", label: "Alloggio", Icon: Home, desc: "Ricerca casa" },
  { href: "/jobs", label: "Lavoro", Icon: Briefcase, desc: "Candidature" },
  { href: "/budget", label: "Budget", Icon: Wallet, desc: "Spese e bilancio" },
  { href: "/documents", label: "Documenti", Icon: FileText, desc: "File e scadenze" },
  { href: "/guide", label: "Guide AI", Icon: Sparkles, desc: "Domande e risposte" },
  { href: "/notes", label: "Note", Icon: StickyNote, desc: "Note condivise" },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = await serverTodayKey();
  const monthStart = monthStartKey(today);

  const [
    { data: settings },
    { data: checklist },
    { count: expenseCount, data: expenses, error: expensesError },
    { count: activeJobs },
    { count: housingCount },
  ] = await Promise.all([
    supabase.from("app_settings").select("*").limit(1).single(),
    supabase.from("checklist_items").select("id, status"),
    supabase
      .from("expenses")
      .select("amount_cad", { count: "exact" })
      .gte("date", monthStart)
      .lt("date", addMonthsKey(monthStart, 1)),
    supabase
      .from("job_applications")
      .select("id", { count: "exact" })
      .in("status", ["inviata", "colloquio"]),
    supabase
      .from("housing")
      .select("id", { count: "exact", head: true })
      .neq("status", "scartato"),
  ]);

  const totalTasks = checklist?.length ?? 0;
  const doneTasks = checklist?.filter((t) => t.status === "fatto").length ?? 0;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const monthExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount_cad), 0) ?? 0;

  const departureDate = settings?.departure_date;
  const countdown = departureDate ? daysUntil(departureDate, today) : null;

  // fine Airbnb: in evidenza nelle ultime settimane, è la scadenza che decide la ricerca casa
  const airbnbEnd = settings?.airbnb_end_date as string | null | undefined;
  const airbnbDays = airbnbEnd ? daysUntil(airbnbEnd, today) : null;
  const showAirbnb = airbnbDays !== null && airbnbDays >= 0 && airbnbDays <= 45;

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Il vostro trasferimento, a colpo d&apos;occhio.
        </p>
      </div>


      {showAirbnb && (
        <Link href="/housing" className="group block">
          <Card className={cn(
            "py-0 transition-colors",
            airbnbDays! <= 7 ? "border-red-200 bg-red-50/50" : airbnbDays! <= 14 ? "border-amber-200 bg-amber-50/50" : "hover:border-maple-200"
          )}>
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                airbnbDays! <= 7 ? "bg-red-100 text-red-600" : airbnbDays! <= 14 ? "bg-amber-100 text-amber-600" : "bg-maple-50 text-maple-500"
              )}>
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {airbnbDays === 0 ? "L'Airbnb finisce oggi" : airbnbDays === 1 ? "L'Airbnb finisce domani" : `L'Airbnb finisce tra ${airbnbDays} giorni`}
                </p>
                <p className="truncate text-xs text-gray-400">
                  {formatDate(airbnbEnd!, { weekday: "long", day: "numeric", month: "long" })} · {housingCount ?? 0} {housingCount === 1 ? "alloggio" : "alloggi"} in lista
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-maple-400" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Countdown alla partenza; dopo la partenza, giorni trascorsi dall'arrivo */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400">
              {countdown !== null && countdown < 0 ? <MapPin className="h-4 w-4" /> : <Plane className="h-4 w-4" />}
              <span className="text-xs font-medium uppercase tracking-wider">
                {countdown !== null && countdown < 0 ? "Arrivati" : "Partenza"}
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
              {countdown !== null ? (
                countdown > 0 ? (
                  <>{countdown}<span className="ml-0.5 text-lg font-normal text-gray-400">g</span></>
                ) : countdown === 0 ? "Oggi!" : (
                  <>{-countdown}<span className="ml-0.5 text-lg font-normal text-gray-400">g</span></>
                )
              ) : (
                <span className="text-base font-normal text-gray-300">Da impostare</span>
              )}
            </p>
            {countdown !== null && countdown < 0 && departureDate && (
              <p className="mt-1.5 text-xs text-gray-400">
                dal {formatDate(departureDate, { day: "numeric", month: "long" })}
              </p>
            )}
            {countdown !== null && countdown > 0 && (
              <div className="absolute -right-3 -bottom-3 opacity-[0.04]">
                <Plane className="h-24 w-24" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Checklist progress */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400">
              <ListChecks className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Checklist</span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
              {progress}<span className="ml-0.5 text-lg font-normal text-gray-400">%</span>
            </p>
            <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full bg-maple-400 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {doneTasks} di {totalTasks} completati
            </p>
          </CardContent>
        </Card>

        {/* Monthly expenses */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Spese mese</span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
              {expensesError ? "—" : formatCAD(monthExpenses)}
            </p>
            <p className="mt-1.5 text-xs text-gray-400">
              {expensesError ? "non disponibile, ricarica la pagina" : `${expenseCount ?? 0} transazioni`}
            </p>
          </CardContent>
        </Card>

        {/* Active applications */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Candidature</span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
              {activeJobs ?? 0}
            </p>
            <p className="mt-1.5 text-xs text-gray-400">
              attive
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Module navigation */}
      <div>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">
          Sezioni
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {moduleCards.map(({ href, label, Icon, desc }) => (
            <Link key={href} href={href} className="group">
              <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-maple-200 group-hover:-translate-y-0.5">
                <CardContent className="flex flex-col items-start gap-3 p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-maple-50 text-maple-500 transition-colors group-hover:bg-maple-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-800">{label}</span>
                      <ArrowRight className="h-3 w-3 text-gray-300 transition-all group-hover:text-maple-400 group-hover:translate-x-0.5" />
                    </div>
                    <p className="text-xs leading-relaxed text-gray-400">{desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
