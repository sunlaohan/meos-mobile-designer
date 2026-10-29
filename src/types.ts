export type ComponentType = string;

export type PropertyControl = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json';

export type DesignTokenKind = 'color' | 'font-size' | 'spacing' | 'radius' | 'dimension' | 'border-width' | 'line-height';

export interface DesignToken {
  name: string;
  value: string;
  kind: DesignTokenKind;
  scope: string;
}

export interface PropertyOption {
  label: string;
  value: string | number;
}

export interface PropertySchema {
  key: string;
  label: string;
  control: PropertyControl;
  description?: string;
  group?: string;
  options?: PropertyOption[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
  target?: 'props' | 'content';
  tokenKind?: DesignTokenKind;
  allowGradient?: boolean;
}

export interface ComponentDefinition {
  type: ComponentType;
  name: string;
  englishName: string;
  category: string;
  description: string;
  keywords: string[];
  docsPath: string;
  defaultProps: Record<string, unknown>;
  defaultContent?: string;
  properties: PropertySchema[];
  previewMode?: 'live' | 'configured';
}

export interface CanvasNode {
  id: string;
  type: ComponentType;
  props: Record<string, any>;
  content?: string;
  children?: CanvasNode[];
  actions?: Record<string, { type: 'open-panel'; targetId: string }>;
  layoutRole?: 'spacer';
  styleId?: string;
  extensions?: ContainerExtensions;
}

export type ContainerExtensionKind = 'pull-refresh' | 'list' | 'lazyload' | 'sticky';
export interface ContainerExtension { enabled: boolean; props: Record<string, any> }
export type ContainerExtensions = Partial<Record<ContainerExtensionKind, ContainerExtension>>;

export type SkillRecipeId = 'list' | 'detail' | 'form';
export type PageBuildState = 'ready' | 'loading' | 'empty' | 'error' | 'disabled' | 'submitting';

export interface PageBuildRequest {
  prompt: string;
  model?: string;
  attachments?: BuildAttachment[];
}

export interface BuildAttachment {
  id: string;
  name: string;
  kind: 'image' | 'code';
  mimeType: string;
  size: number;
  content: string;
}

export interface PageBuildReport {
  interactions?: { sourceId: string; source: string; event: string; targetId: string; target: string }[];
  attachments?: Pick<BuildAttachment, 'name' | 'kind' | 'size'>[];
  generation?: { mode: 'ai'; requestedModel: string; actualModel: string; usage?: Record<string, unknown> };
  skill: string;
  version: string;
  fingerprint: string;
  sourceFiles: string[];
  recipeId: SkillRecipeId;
  recipeTitle: string;
  state: PageBuildState;
  prompt: string;
  rules: string[];
  warnings: string[];
  elements: { element: string; component: string; variant: string; props: string[] }[];
  coverage: { covered: number; total: number; percent: number };
}

export interface AiModel {
  id: string;
  family: string;
  label?: string;
  supportsImages?: boolean;
}

export interface GeneratedPage {
  title: string;
  summary: string;
  nodes: CanvasNode[];
  report?: PageBuildReport;
}

export interface SavedDesign {
  version: 1;
  title: string;
  updatedAt: string;
  nodes: CanvasNode[];
  report?: PageBuildReport;
}
