import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const activity = await prisma.activity.create({
    data: {
      clientId: body.clientId,
      type: body.type || 'NOTATKA',
      title: body.title,
      content: body.content || null,
      date: body.date ? new Date(body.date) : new Date(),
    },
  })

  return NextResponse.json(activity, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await prisma.activity.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
