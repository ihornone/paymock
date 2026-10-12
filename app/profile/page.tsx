'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { DashboardProvider, useDashboard } from '@/components/dashboard/dashboard-context';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  KeyRound,
  Key,
  Copy,
  Check,
  User,
  Eye,
  EyeOff,
  Code2,
} from 'lucide-react';

function ProfileContent() {
  const {
    user,
    copyToClipboard,
    copiedKey,
  } = useDashboard();

  const [showAccountToken, setShowAccountToken] = React.useState(false);

  const accountToken = user?.id ? `pmk_usr_${user.id}` : 'pmk_usr_unauthenticated';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787';

  const cursorMcpConfig = JSON.stringify(
    {
      mcpServers: {
        paymock: {
          url: `${currentOrigin}/api/mcp`,
          headers: {
            'X-Token': accountToken,
          },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Профіль користувача та API Ключі</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Керуйте даними облікового запису та глобальним персональним токеном для підключення AI-асистентів.
        </p>
      </div>

      {/* 1. User Profile Details Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Особисті дані</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">
                Ім'я користувача
              </label>
              <div className="h-10 px-3 rounded-md border border-input bg-secondary/40 font-medium text-foreground flex items-center">
                <span className="truncate">{user?.fullName || 'Мерчант'}</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">
                Основний Email
              </label>
              <div className="h-10 px-3 rounded-md border border-input bg-secondary/40 font-mono text-[11px] text-foreground flex items-center">
                <span className="truncate">{user?.primaryEmailAddress?.emailAddress || 'Не вказано'}</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">
                User ID (Clerk)
              </label>
              <div className="h-10 px-3 rounded-md border border-input bg-secondary/40 font-mono text-[11px] text-foreground flex items-center justify-between">
                <span className="truncate mr-2 select-all">{user?.id || '—'}</span>
                {user?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => copyToClipboard(user.id, 'user-id')}
                  >
                    {copiedKey === 'user-id' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Global Personal Access Token (MCP Key) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Глобальний токен акаунта (Personal Access Token / MCP)</CardTitle>
          </div>
          <CardDescription className="text-xs leading-relaxed">
            Глобальний секретний ключ вашого акаунта. Дозволяє AI-асистентам у{' '}
            <strong className="text-foreground">Cursor IDE</strong>, <strong className="text-foreground">Claude Desktop</strong>,{' '}
            <strong className="text-foreground">Windsurf</strong> чи <strong className="text-foreground">Zed</strong> керувати всіма вашими проєктами, реєструвати нові магазини, симулювати платежі та перевіряти вебхуки.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-secondary/50 p-3.5">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Key className="h-3 w-3 text-muted-foreground" />
                Персональний токен розробника
              </span>
              <button
                type="button"
                onClick={() => setShowAccountToken(!showAccountToken)}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
              >
                {showAccountToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span>{showAccountToken ? 'Приховати' : 'Показати'}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div className="font-mono text-xs text-foreground select-all truncate font-semibold">
                {showAccountToken ? accountToken : `${accountToken.slice(0, 14)}••••••••••••••••••••••••`}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs cursor-pointer"
                  onClick={() => copyToClipboard(accountToken, 'profile-token')}
                >
                  {copiedKey === 'profile-token' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Скопійовано токен</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Копіювати токен</span>
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs cursor-pointer"
                  onClick={() => copyToClipboard(cursorMcpConfig, 'profile-cursor-config')}
                >
                  {copiedKey === 'profile-cursor-config' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Скопійовано .cursor/mcp.json</span>
                    </>
                  ) : (
                    <>
                      <Code2 className="h-3.5 w-3.5" />
                      <span>Копіювати MCP конфіг</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground flex items-center justify-between flex-wrap gap-2">
            <span>
              Вставте цей токен у заголовок <code className="font-mono text-foreground font-semibold">X-Token</code> при підключенні до <code className="font-mono text-foreground font-semibold">/api/mcp</code>.
            </span>
            <Link
              href="/docs/mcp"
              className="text-primary hover:underline font-medium text-[11px] flex items-center gap-1"
            >
              Документація по налаштуванню MCP →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Завантаження профілю...</div>}>
      <DashboardProvider>
        <DashboardShell pageTitle="Профіль та API токени">
          <ProfileContent />
        </DashboardShell>
      </DashboardProvider>
    </Suspense>
  );
}
