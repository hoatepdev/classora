import * as React from "react";
import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <div className="register"><table className={cn(className)} {...props} /></div>;
}

function TableHeader(props: React.ComponentProps<"thead">) {
  return <thead {...props} />;
}

function TableBody(props: React.ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

function TableRow(props: React.ComponentProps<"tr">) {
  return <tr {...props} />;
}

function TableHead(props: React.ComponentProps<"th">) {
  return <th {...props} />;
}

function TableCell(props: React.ComponentProps<"td">) {
  return <td {...props} />;
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
