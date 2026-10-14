"use client";

import { Authenticated, useQuery } from "convex/react";
import { Suspense } from "react";
import { api } from "../../../convex/_generated/api";
import { Text } from "@/components/Text";
import { Admin } from "./Admin";

// Admin: careerbot.dev's operators only (People, Cost by step, Log; ?section=). Anyone else is told it isn't theirs.
export default function AdminPage() {
  return (
    <Authenticated>
      <main className="flex min-h-0 w-full flex-1 flex-col">
        <Suspense>
          <OperatorsOnly />
        </Suspense>
      </main>
    </Authenticated>
  );
}

function OperatorsOnly() {
  const operator = useQuery(api.operators.isOperator);
  if (operator === undefined) return null;
  if (!operator)
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Text muted>Only CareerBot’s operators can open Admin.</Text>
      </div>
    );
  return <Admin />;
}
