import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Minimal markdown renderer for roadmap-authored text (instructions, hints,
 * solutions): bold, inline code, fenced code blocks with a copy button, and
 * simple lists. Extracted from RoadmapPlayer so every player surface renders
 * roadmap text the same way.
 */

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div style={styles.codeBlockContainer}>
      <div style={styles.codeBlockHeader}>
        <button
          onClick={handleCopy}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            ...styles.copyBtn,
            backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
          title="Copy code"
        >
          {copied ? <Check size={12} color="var(--color-success)" /> : <Copy size={12} color="var(--neutral-400)" />}
        </button>
      </div>
      <pre style={styles.pre}>
        <code style={styles.codeBlock}>{code}</code>
      </pre>
    </div>
  );
}

export function renderInstruction(text: string) {
  if (!text) return null;

  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const parseInline = (inlineText: string): React.ReactNode => {
    const inlineRegex = /(\*\*.*?\*\*|`.*?`)/g;
    const parts = inlineText.split(inlineRegex);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={index}
            style={{
              fontFamily: 'monospace',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              padding: '2px 4px',
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--color-text-primary)',
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const codeContent = codeBlockLines.join('\n');
        blocks.push(<CodeBlock key={`code-${i}`} code={codeContent} />);
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (line.trim() === '') {
      blocks.push(<div key={`empty-${i}`} style={{ height: '8px' }} />);
      continue;
    }

    const listMatch = line.match(/^(\d+\.|\-|\*)\s+(.*)$/);
    if (listMatch) {
      const marker = listMatch[1];
      const content = listMatch[2];
      blocks.push(
        <div key={`list-${i}`} style={styles.listItem}>
          <span style={styles.listMarker}>{marker}</span>
          <span style={styles.listContent}>{parseInline(content)}</span>
        </div>
      );
    } else {
      blocks.push(
        <p key={`p-${i}`} style={styles.instructionLine}>
          {parseInline(line)}
        </p>
      );
    }
  }

  return <div style={styles.markdownWrapper}>{blocks}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  markdownWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  instructionLine: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
  },
  codeBlockContainer: {
    margin: '8px 0',
    backgroundColor: 'var(--neutral-900)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  pre: {
    margin: 0,
    padding: '12px',
    overflowX: 'auto',
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: 'var(--neutral-200)',
    lineHeight: 1.5,
    whiteSpace: 'pre',
  },
  listItem: {
    display: 'flex',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    paddingLeft: '4px',
  },
  listMarker: {
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    flexShrink: 0,
  },
  listContent: {
    flex: 1,
  },
  codeBlockHeader: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '6px 8px 0 8px',
    backgroundColor: 'var(--neutral-900)',
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
};
