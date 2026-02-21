Radius:
- surface: rounded-2xl
- control: rounded-2xl
- chip: rounded-full
- small: rounded-xl

Spacing:
- control height: h-10 (40px)
- control padding: px-3 py-2
- list row padding: px-4 py-3
- section spacing: gap-2 / gap-3, mt-2 / mt-3

Borders:
- default: border border-gray-200/70
- hover: hover:border-gray-300/80
- divider: border-t border-gray-100

Typography:
- title: text-[15px] font-medium tracking-wide text-gray-800
- secondary: text-xs text-gray-400
- meta: text-[13px] text-gray-500

Focus:
- focus:ring-2 focus:ring-linkflow-accent/15
- focus:outline-none
- focus:border-gray-300

Dropdown (same as "创建任务 -> 选择任务队列"):
- base: h-9 rounded-2xl border border-transparent bg-transparent px-3
- text: text-[13px] font-medium text-gray-600
- interaction: transition-all duration-150 hover:border-gray-200/70 hover:bg-gray-50
- focus: focus:outline-none focus:ring-2 focus:ring-linkflow-accent/15
- menu: rounded-2xl border border-gray-200/70 bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.06)]
- item: h-9 px-3 rounded-xl text-[13px] font-medium, hover:bg-gray-50, selected:bg-gray-100
- scrollbar: thin (or system), avoid abrupt custom native style
- implementation rule: use shared `AppSelect` component only; do not add raw `<select>` UI separately

Shadows (very subtle):
- popover: shadow-[0_8px_24px_rgba(0,0,0,0.06)]
