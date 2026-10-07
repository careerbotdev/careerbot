import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "../../site/meta";
import { DocsArticle } from "../DocsArticle";
import { source } from "../source";

// Every docs page, built at build time from its MDX (content/docs); an address with no page is the 404.
export const dynamicParams = false;
export const generateStaticParams = () => source.generateParams();

export async function generateMetadata({ params }: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  return pageMetadata(page.url, { title: page.data.title, description: page.data.description });
}

export default async function DocsRoute({ params }: PageProps<"/docs/[[...slug]]">) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  return <DocsArticle page={page} />;
}
