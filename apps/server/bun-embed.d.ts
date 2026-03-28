declare module "*.sql" {
	const path: string;
	export default path;
}

declare module "*/_journal.json" {
	const path: string;
	export default path;
}

declare module "*/meta/_journal.json" {
	const path: string;
	export default path;
}
