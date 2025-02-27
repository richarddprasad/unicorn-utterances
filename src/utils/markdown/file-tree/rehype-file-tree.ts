/**
 * This was taken from Astro docs:
 * https://github.com/withastro/docs/blob/83e4e7946933b468f857c76f8d4f9861e37d7059/src/components/internal/rehype-file-tree.ts
 *
 * But modified such that:
 * - It works with HTML comments
 * - You can attach metadata to files and folders
 * - It is required to use inline code blocks for files and folders names
 */
/**
 * Usage:
 * <!-- filetree:start -->
 * - `somedir/`
 * - `otherdir/`
 * 	   - `index.ts`
 * - `src/{open: false}`
 *     - `index.html`
 * - `index.css`
 * <!-- filetree:end -->
 */
import { fromHtml } from "hast-util-from-html";
import { toString } from "hast-util-to-string";
import { h } from "hastscript";
import type { Element, HChild } from "hastscript/lib/core";
import { CONTINUE, SKIP, visit } from "unist-util-visit";
import { getIcon } from "./file-tree-icons";
import replaceAllBetween from "unist-util-replace-all-between";
import { Node } from "unist";
import { Root } from "hast";
import JSON5 from "json5";

/** Make a text node with the pass string as its contents. */
const Text = (value = ""): { type: "text"; value: string } => ({
	type: "text",
	value,
});

/** Convert an HTML string containing an SVG into a HAST element node. */
const makeSVGIcon = (svgString: string) => {
	const root = fromHtml(svgString, { fragment: true });
	const svg = root.children[0] as Element;
	svg.properties = {
		...svg.properties,
		width: 16,
		height: 16,
		class: "tree-icon",
		"aria-hidden": "true",
	};
	return svg;
};

const FileIcon = (filename: string) => {
	const { svg } = getIcon(filename);
	return makeSVGIcon(svg);
};

const FolderIcon = makeSVGIcon(
	'<svg viewBox="-5 -5 26 26"><path d="M1.8 1A1.8 1.8 0 0 0 0 2.8v10.4c0 1 .8 1.8 1.8 1.8h12.4a1.8 1.8 0 0 0 1.8-1.8V4.8A1.8 1.8 0 0 0 14.2 3H7.5a.3.3 0 0 1-.2-.1l-.9-1.2A2 2 0 0 0 5 1H1.7z"/></svg>'
);

export const rehypeFileTree = () => {
	return (tree) => {
		function replaceFiletreeNodes(nodes: Node[]) {
			const root = { type: "root", children: nodes } as Root;
			visit(root, "element", (node) => {
				// Strip nodes that only contain newlines
				node.children = node.children.filter(
					(child) =>
						child.type === "comment" ||
						child.type !== "text" ||
						!/^\n+$/.test(child.value)
				);

				if (node.tagName !== "li") return CONTINUE;

				// Ensure node has properties so we can assign classes later.
				if (!node.properties) node.properties = {};

				const [firstChild, ...otherChildren] = node.children;

				/**
				 * If a file or folder has an object at the end, assume it's a metadata object
				 * that we want to associate with the file or folder.
				 *
				 *  @eg: `folder/ {open: false}`
				 */
				let metadata: { open?: boolean } = {};

				visit({ type: "root", children: [firstChild] }, "text", (node) => {
					const match = node.value.match(/(.*)\s*({.*})\s*$/);
					if (match) {
						node.value = match[1];
						metadata = JSON5.parse(match[2]);
					}
				});

				const comment: HChild[] = [];
				if (firstChild.type === "text") {
					const [filename, ...fragments] = firstChild.value.split(" ");
					firstChild.value = filename;
					comment.push(fragments.join(" "));
				}
				const subTreeIndex = otherChildren.findIndex(
					(child) => child.type === "element" && child.tagName === "ul"
				);
				const commentNodes =
					subTreeIndex > -1
						? otherChildren.slice(0, subTreeIndex)
						: [...otherChildren];
				otherChildren.splice(
					0,
					subTreeIndex > -1 ? subTreeIndex : otherChildren.length
				);
				comment.push(...commentNodes);

				const firstChildTextContent = toString(firstChild);

				// Decide a node is a directory if it ends in a `/` or contains another list.
				const isDirectory =
					/\/\s*$/.test(firstChildTextContent) ||
					otherChildren.some(
						(child) => child.type === "element" && child.tagName === "ul"
					);
				const isPlaceholder = /^\s*(\.{3}|…)\s*$/.test(firstChildTextContent);
				const isHighlighted =
					firstChild.type === "element" && firstChild.tagName === "strong";
				const hasContents = otherChildren.length > 0;

				const fileExtension = isDirectory
					? "dir"
					: firstChildTextContent.trim().split(".").pop() || "";

				const icon = h(
					"span",
					isDirectory ? FolderIcon : FileIcon(firstChildTextContent)
				);
				if (!icon.properties) icon.properties = {};
				if (isDirectory) {
					icon.properties["aria-label"] = "Directory";
				}

				node.properties.class = isDirectory ? "directory" : "file";
				if (isPlaceholder) node.properties.class += " empty";
				node.properties["data-filetype"] = fileExtension;

				const treeEntry = h(
					"span",
					{ class: "tree-entry" },
					h("span", { class: isHighlighted ? "highlight" : "" }, [
						isPlaceholder ? null : icon,
						firstChild,
					]),
					Text(comment.length > 0 ? " " : ""),
					comment.length > 0
						? h("span", { class: "comment" }, ...comment)
						: Text()
				);

				if (isDirectory) {
					node.children = [
						h("details", { open: metadata.open ?? hasContents }, [
							h("summary", treeEntry),
							...(hasContents ? otherChildren : [h("ul", h("li", "…"))]),
						]),
					];
					// Continue down the tree.
					return CONTINUE;
				}

				node.children = [treeEntry, ...otherChildren];

				// Files can’t contain further files or directories, so skip iterating children.
				return SKIP;
			});

			return [h("div", { class: "docs-file-tree" }, root.children)];
		}

		replaceAllBetween(
			tree,
			{ type: "raw", value: "<!-- filetree:start -->" } as never,
			{ type: "raw", value: "<!-- filetree:end -->" } as never,
			replaceFiletreeNodes
		);
		replaceAllBetween(
			tree,
			{ type: "comment", value: " filetree:start " } as never,
			{ type: "comment", value: " filetree:end " } as never,
			replaceFiletreeNodes
		);
	};
};
