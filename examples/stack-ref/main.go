package main

import (
	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

// Exercises: cross-stack export reads (GET .../export), stack output
// resolution, reading secret outputs from another stack (batch-decrypt),
// StackReference resource in state.

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "")
		sourceStack := cfg.Get("sourceStack")
		if sourceStack == "" {
			sourceStack = "dev-org/multi-resource/dev"
		}

		ref, err := pulumi.NewStackReference(ctx, "source", &pulumi.StackReferenceArgs{
			Name: pulumi.String(sourceStack),
		})
		if err != nil {
			return err
		}

		prefixOutput := ref.GetStringOutput(pulumi.String("prefixName"))

		derived, err := random.NewRandomPet(ctx, "derived", &random.RandomPetArgs{
			Length: pulumi.Int(2),
			Prefix: prefixOutput,
		})
		if err != nil {
			return err
		}

		ctx.Export("sourceStackName", pulumi.String(sourceStack))
		ctx.Export("derivedName", derived.ID())
		ctx.Export("sourcePrefix", prefixOutput)
		ctx.Export("sourceRoll", ref.GetOutput(pulumi.String("rollResult")))

		return nil
	})
}
