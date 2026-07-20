{{/* Common helpers for solana-ontology Helm chart */}}
{{- define "solana-ontology.fullname" -}}
{{- printf "%s" .Release.Name -}}
{{- end -}}
