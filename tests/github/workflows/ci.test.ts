import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('CI Workflow (.github/workflows/ci.yml)', () => {
  let workflowContent: string

  beforeAll(() => {
    const workflowPath = join(process.cwd(), '.github/workflows/ci.yml')
    workflowContent = readFileSync(workflowPath, 'utf8')
  })

  describe('Workflow Structure', () => {
    it('should have correct name', () => {
      expect(workflowContent).toContain('name: CI')
    })

    it('should trigger on push to main', () => {
      expect(workflowContent).toContain('push:')
      expect(workflowContent).toContain('branches: [main]')
    })

    it('should trigger on pull_request to master', () => {
      expect(workflowContent).toContain('pull_request:')
    })

    it('should define all required jobs', () => {
      expect(workflowContent).toContain('typecheck:')
      expect(workflowContent).toContain('test-core:')
      expect(workflowContent).toContain('test-orchestra:')
      expect(workflowContent).toContain('test-cli:')
      expect(workflowContent).toContain('test-remaining:')
      expect(workflowContent).toContain('build:')
    })
  })

  describe('Typecheck Job', () => {
    it('should run npm run lint', () => {
      expect(workflowContent).toContain('npm run lint')
    })

    it('should use Node.js 22.x', () => {
      expect(workflowContent).toContain("node-version: '22.x'")
    })
  })

  describe('Test Jobs', () => {
    it('should test across multiple Node.js versions', () => {
      expect(workflowContent).toContain('[18.x, 20.x, 22.x]')
    })

    it('should depend on typecheck', () => {
      expect(workflowContent).toContain('needs: typecheck')
    })

    it('should run core tests', () => {
      expect(workflowContent).toContain('npx vitest run tests/core/ tests/agents/')
    })

    it('should run orchestra tests', () => {
      expect(workflowContent).toContain('npx vitest run tests/orchestra/')
    })

    it('should run CLI tests', () => {
      expect(workflowContent).toContain('npx vitest run tests/cli/')
    })

    it('should run remaining tests', () => {
      expect(workflowContent).toContain('tests/mcp/')
      expect(workflowContent).toContain('tests/api/')
    })

    it('should set timeout-minutes for test steps', () => {
      expect(workflowContent).toContain('timeout-minutes:')
    })
  })

  describe('Build Job', () => {
    it('should depend on test jobs', () => {
      const buildIdx = workflowContent.indexOf('\n  build:')
      const buildBlock = buildIdx >= 0 ? workflowContent.slice(buildIdx) : ''
      expect(buildBlock).toContain('needs:')
      expect(buildBlock).toContain('test-core')
      expect(buildBlock).toContain('test-orchestra')
    })

    it('should run npm run build', () => {
      expect(workflowContent).toMatch(/build[\s\S]*?run: npm run build/)
    })

    it('should verify dist files exist', () => {
      expect(workflowContent).toContain('test -f dist/cli/index.js')
      expect(workflowContent).toContain('test -f dist/mcp/server.js')
    })

    it('should verify shebang in CLI entry point', () => {
      expect(workflowContent).toContain('#!/usr/bin/env node')
    })
  })
})
