import { NextResponse } from 'next/server';

const EDGE_FUNCTION_URL = 'https://fwefqptyudpwzvjzeyuo.functions.supabase.co/enviar-alerta';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.ok ? 200 : 500 });
  } catch (error) {
    console.error('Erro na API route:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}