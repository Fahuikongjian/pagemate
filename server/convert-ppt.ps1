param([Parameter(Mandatory=$true)][string]$InputFile, [Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
$presentation = $null
$application = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  # Open the imported copy without a presentation window and as read-only.
  $presentation = $application.Presentations.Open($InputFile, -1, 0, 0)
  $presentation.SaveAs($OutputFile, 32)
} finally {
  if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
  if ($null -ne $application) {
    # Do not quit an application that has the user's other presentations open.
    if ($application.Presentations.Count -eq 0) { $application.Quit() }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($application)
  }
}
