// #25 shared classic-script globals for public extension pages - PreYem
// Transpiled with languages.js? Not loaded as JS itself; declarations emit no runtime code.
// Settings and popup pages must not redeclare these names because public pages are separate
// classic scripts sharing the same global scope.

declare const LANGUAGES: { code: string; name: string }[];
declare function uiText(code: string, key: string): string;
declare function matchLang(locale: string): string;
declare function sanitizeLang(code: string): string;
