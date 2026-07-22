import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"]
  		},
  		colors: {
  			background: 'oklch(var(--background))',
  			foreground: 'oklch(var(--foreground))',
  			card: {
  				DEFAULT: 'oklch(var(--card))',
  				foreground: 'oklch(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'oklch(var(--popover))',
  				foreground: 'oklch(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'oklch(var(--primary))',
  				foreground: 'oklch(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'oklch(var(--secondary))',
  				foreground: 'oklch(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'oklch(var(--muted))',
  				foreground: 'oklch(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'oklch(var(--accent))',
  				foreground: 'oklch(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'oklch(var(--destructive))',
  				foreground: 'oklch(var(--destructive-foreground))'
  			},
  			border: 'oklch(var(--border))',
  			input: 'oklch(var(--input))',
  			ring: 'oklch(var(--ring))',
  			chart: {
  				'1': 'oklch(var(--chart-1))',
  				'2': 'oklch(var(--chart-2))',
  				'3': 'oklch(var(--chart-3))',
  				'4': 'oklch(var(--chart-4))',
  				'5': 'oklch(var(--chart-5))'
  			},
  			// Ledger — cool indigo/slate-blue brand anchor
  			ledger: {
  				50:  'oklch(97% 0.015 260 / <alpha-value>)',
  				100: 'oklch(93% 0.030 260 / <alpha-value>)',
  				200: 'oklch(86% 0.050 258 / <alpha-value>)',
  				300: 'oklch(77% 0.080 257 / <alpha-value>)',
  				400: 'oklch(68% 0.110 256 / <alpha-value>)',
  				500: 'oklch(58% 0.150 258 / <alpha-value>)',
  				600: 'oklch(50% 0.160 260 / <alpha-value>)',
  				700: 'oklch(43% 0.150 262 / <alpha-value>)',
  				800: 'oklch(36% 0.120 264 / <alpha-value>)',
  				900: 'oklch(29% 0.090 266 / <alpha-value>)',
  				950: 'oklch(19% 0.060 268 / <alpha-value>)'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
