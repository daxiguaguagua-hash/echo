import { ref, computed } from 'vue'
import { getProjects } from './echo-api'

interface Project {
  id: string
  name: string
  root: string
  dataRoot: string
}

// Module-level state for cross-component sharing
const selected = ref<string>('__all__')
const projects = ref<Project[]>([])
const loaded = ref(false)

export function useProjectFilter() {
  const selectedProject = computed(() => selected.value)
  const allProjects = computed(() => projects.value)

  async function load() {
    if (loaded.value) return
    try {
      const result = await getProjects()
      projects.value = result.projects || []
      loaded.value = true
    } catch (_) {}
  }

  function select(projectId: string) {
    selected.value = projectId
    try { localStorage.setItem('echo-project-filter', projectId) } catch (_) {}
  }

  function restore() {
    try {
      const saved = localStorage.getItem('echo-project-filter')
      if (saved) selected.value = saved
    } catch (_) {}
  }

  return { selectedProject, allProjects, load, select, restore }
}
