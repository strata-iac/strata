package main

import (
	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// Exercises: Protect flag in checkpoint (blocks destroy), RetainOnDelete
// flag (removed from state but not deleted), Aliases (state migration
// without recreation), resource option persistence in state.

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		// Protected resource — destroy should be rejected by the engine.
		protected, err := random.NewRandomPet(ctx, "protected-pet", &random.RandomPetArgs{
			Length: pulumi.Int(3),
		}, pulumi.Protect(true))
		if err != nil {
			return err
		}

		// Retain-on-delete — removed from Pulumi state on destroy but
		// the provider's delete is NOT called.
		retained, err := random.NewRandomId(ctx, "retained-id", &random.RandomIdArgs{
			ByteLength: pulumi.Int(8),
		}, pulumi.RetainOnDelete(true))
		if err != nil {
			return err
		}

		// Normal resource for comparison baseline.
		normal, err := random.NewRandomString(ctx, "normal-string", &random.RandomStringArgs{
			Length:  pulumi.Int(16),
			Special: pulumi.Bool(false),
		})
		if err != nil {
			return err
		}

		// Resource with alias — tests state migration.
		// First deploy uses "aliased-pet", state records alias pointing to "old-pet-name".
		_, err = random.NewRandomPet(ctx, "aliased-pet", &random.RandomPetArgs{
			Length: pulumi.Int(2),
		}, pulumi.Aliases([]pulumi.Alias{
			{Name: pulumi.String("old-pet-name")},
		}))
		if err != nil {
			return err
		}

		// DeleteBeforeReplace resource.
		_, err = random.NewRandomId(ctx, "replace-first", &random.RandomIdArgs{
			ByteLength: pulumi.Int(4),
		}, pulumi.DeleteBeforeReplace(true))
		if err != nil {
			return err
		}

		ctx.Export("protectedName", protected.ID())
		ctx.Export("retainedHex", retained.Hex)
		ctx.Export("normalValue", normal.Result)

		return nil
	})
}
