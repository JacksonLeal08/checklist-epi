'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';
import type { Epi } from '@/types';
import { toast } from 'sonner';

// Componente de upload simples
function ImageUpload({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  return (
    <input
      type="file"
      accept="image/*"
      multiple
      onChange={handleChange}
      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
    />
  );
}

export default function ChecklistPage() {
  const [epis, setEpis] = useState<Epi[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [matriculaValida, setMatriculaValida] = useState(false);
  const [funcionarioNome, setFuncionarioNome] = useState('');
  const [emailLider, setEmailLider] = useState('');

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      matricula: '',
      respostas: {} as Record<string, 'conforme' | 'nao_conforme'>,
    }
  });

  const matricula = watch('matricula');

  // Carregar EPIs
  useEffect(() => {
    async function loadEpis() {
      const { data, error } = await supabase
        .from('epis')
        .select('*')
        .order('id');
      if (error) console.error('Erro ao carregar EPIs:', error);
      else setEpis(data || []);
      setLoading(false);
    }
    loadEpis();
  }, []);

  // Validar matrícula
  useEffect(() => {
    const timer = setTimeout(() => {
      if (matricula?.length >= 3) validateMatricula(matricula);
    }, 500);
    return () => clearTimeout(timer);
  }, [matricula]);

  const validateMatricula = async (matricula: string) => {
    const { data, error } = await supabase
      .from('funcionarios')
      .select('nome, email_lider')
      .eq('matricula', matricula)
      .single();

    if (data) {
      setMatriculaValida(true);
      setFuncionarioNome(data.nome);
      setEmailLider(data.email_lider);
    } else {
      setMatriculaValida(false);
      setFuncionarioNome('');
      setEmailLider('');
    }
  };

  const temNaoConforme = () => {
    const respostas = watch('respostas');
    return Object.values(respostas).some(v => v === 'nao_conforme');
  };

  const onSubmit = async (data: any) => {
    setSubmitting(true);

    try {
      // Upload das imagens
      const fotoUrls: string[] = [];
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const fileName = `${data.matricula}-${Date.now()}-${file.name}`;
          const { error } = await supabase.storage
            .from('fotos-epis')
            .upload(`public/${fileName}`, file);
          if (error) throw error;

          const { data: urlData } = supabase.storage
            .from('fotos-epis')
            .getPublicUrl(`public/${fileName}`);
          fotoUrls.push(urlData.publicUrl);
        }
      }

      // Montar objeto de respostas
      const respostasObj: Record<string, any> = {};
      epis.forEach(epi => {
        const resposta = data[`respostas.${epi.id}`];
        if (resposta) {
          respostasObj[epi.id] = {
            nome: epi.nome,
            status: resposta,
            tipo: epi.tipo
          };
        }
      });

      // Inserir no banco
      const { error: insertError } = await supabase
        .from('respostas')
        .insert({
          matricula: data.matricula,
          funcionario_nome: funcionarioNome,
          respostas: respostasObj,
          fotos: fotoUrls,
          data_envio: new Date().toISOString(),
          status_geral: temNaoConforme() ? 'nao_conforme' : 'conforme'
        });

      if (insertError) throw insertError;

      // Disparar alerta se necessário
      if (temNaoConforme() && emailLider) {
        const naoConformes = Object.values(respostasObj)
          .filter((r: any) => r.status === 'nao_conforme')
          .map((r: any) => r.nome);

        await fetch('/api/enviar-alerta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matricula: data.matricula,
            nome: funcionarioNome,
            emailLider,
            naoConformes,
            fotos: fotoUrls
          })
        });
      }

      alert('Checklist enviado com sucesso!');
      // Limpar formulário
      setSelectedFiles([]);
      setMatriculaValida(false);
      setFuncionarioNome('');
      setEmailLider('');
      setValue('matricula', '');
      epis.forEach(epi => setValue(`respostas.${epi.id}`, undefined));
    } catch (error) {
      console.error(error);
      alert('Erro ao enviar formulário.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center p-8">Carregando EPIs...</div>;

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <h1 className="text-2xl font-bold mb-6">Checklist de EPIs</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Matrícula */}
        <div>
          <label className="block text-sm font-medium mb-1">Matrícula</label>
          <input
            type="text"
            {...register('matricula', { required: 'Matrícula obrigatória' })}
            className="w-full border rounded px-3 py-2"
            disabled={submitting}
          />
          {errors.matricula && <p className="text-red-600 text-sm">{String(errors.matricula.message)}</p>}
          {funcionarioNome && (
            <p className="text-green-600 text-sm mt-1">✓ {funcionarioNome}</p>
          )}
        </div>

        {/* Lista de EPIs (só aparece se matrícula válida) */}
        {matriculaValida && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">EPIs a verificar</h2>
            {epis.map(epi => (
              <div key={epi.id} className="border rounded p-4">
                <p className="font-medium">{epi.nome}</p>
                <p className="text-sm text-gray-600 mb-2">Tipo: {epi.tipo}</p>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      {...register(`respostas.${epi.id}`, { required: true })}
                      value="conforme"
                      className="mr-2"
                    /> Conforme
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      {...register(`respostas.${epi.id}`, { required: true })}
                      value="nao_conforme"
                      className="mr-2"
                    /> Não conforme
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload de imagens */}
        {matriculaValida && (
          <div>
            <label className="block text-sm font-medium mb-2">Fotos (opcional)</label>
            <ImageUpload onFilesSelected={setSelectedFiles} />
            {selectedFiles.length > 0 && (
              <p className="text-sm mt-1">{selectedFiles.length} arquivo(s) selecionado(s).</p>
            )}
          </div>
        )}

        {/* Botão de envio */}
        {matriculaValida && (
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {submitting ? 'Enviando...' : 'Enviar checklist'}
          </button>
        )}
      </form>
    </div>
  );
}