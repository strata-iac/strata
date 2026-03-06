package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"

	"github.com/strata-iac/strata/internal/http/encode"
)

func CLIVersion(w http.ResponseWriter, _ *http.Request) {
	encode.WriteJSON(w, http.StatusOK, apitype.CLIVersionResponse{
		LatestVersion:        "3.225.1",
		OldestWithoutWarning: "3.0.0",
	})
}

func Capabilities(w http.ResponseWriter, _ *http.Request) {
	cfg, _ := json.Marshal(apitype.DeltaCheckpointUploadsConfigV2{
		CheckpointCutoffSizeBytes: 0,
	})
	encode.WriteJSON(w, http.StatusOK, apitype.CapabilitiesResponse{
		Capabilities: []apitype.APICapabilityConfig{
			{
				Capability:    apitype.DeltaCheckpointUploadsV2,
				Version:       2,
				Configuration: cfg,
			},
		},
	})
}
