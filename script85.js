angular
    .module('webApp')
    .controller('compradoresController', ['$rootScope', '$scope', '$compile', '$location', 'popupService', '$uibModal', '$http', '$window', 'session', 'home', 'provincia', 'localidad', 'Comprador', 'Formulario08D', 'SITE', '$filter', 'appConfig',
        compradoresController]);

function compradoresController($rootScope, $scope, $compile, $location, popupService, $uibModal, $http, $window, session, home, provincia, localidad, Comprador, Formulario08D, SITE, $filter, appConfig) {
    var vm = this;

    vm.formErrors = [];

    var tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/compradores/continuar');
        return;
    }

    vm.vendedores = tramite.Vendedores || [];
    vm.compradores = tramite.Compradores || [];
    vm.cedulas = tramite.Cedulas || [];
    vm.gravamenes = tramite.Gravamenes || [];

    if (vm.gravamenes.length > 0)
        vm.formErrors.push("El vendedor declaro uno o varios embargos/prendas");

    //var url = $location.url();
    //if (url == '/compradores/confirmar') {

    //}

    SITE.epagosHabilitado({ rs: tramite.CodigoRegistro },
        function (response) {
            vm.epagosHabilitado = response.habilitado;
        });

    vm.Tramite = tramite;

    vm.PrecioCompra = '';
    vm.Concepto = '';
    vm.Uso = '';

    vm.mostrarEPago = (vm.Tramite.CodigoTramite !== "083001" && vm.Tramite.CodigoTramite !== "084001");
    console.log(vm.Tramite.CodigoTramite)
    console.log(tramite.CodigoRegistro, tramite.CodigoRegistroDestino)
    //vm.mostrarEPago = (tramite.CodigoRegistro === tramite.CodigoRegistroDestino)

    vm.TipoDocumento = function (tipoDoc) {
        switch (tipoDoc) {
            case "1": return "DNI";
            case "2": return "Libreta Enrolamiento";
            case "3": return "Libreta Cívica";
            case "4": return "DNI Extranjero";
            case "5": return "Cédula Extranjero";
            case "6": return "Pasaporte";
            case "C": return "CUIT";
            default:
                return "";
        }
    }

    vm.agregarCedula = function () {
        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/compradores/cedula.html',
            controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
                var tramite = session.get(0);
                $scope.Compradores = tramite.Compradores || [];

                $scope.Tipo = 'CA';
                $scope.TipoDocumento = '8';

                $scope.aceptar = function () {
                    $scope.$broadcast('show-errors-check-validity', 'form');
                    if (!$scope.legalCtrl.form.$valid) {
                        return;
                    }

                    var cedula = new Cedula();

                    if ($scope.Tipo === "CA")
                        cedula.AutorizanteIndex = $scope.Compradores.indexOf($scope.Autorizante);
                    cedula.TipoCedula = $scope.Tipo;
                    cedula.TipoDocumento = $scope.TipoDocumento;
                    cedula.NroDocumento = $scope.NroDocumento;
                    cedula.Apellido = $scope.Apellido;
                    cedula.Nombre = $scope.Nombre;

                    $uibModalInstance.close(cedula);
                }

                $scope.close = function () {
                    $scope.subtitulo1 = vm.subtitulo1;
                    $scope.mostrar = vm.mostrar;

                    $uibModalInstance.dismiss('cancel');
                }
            }],
            controllerAs: 'legalCtrl',
            backdrop: 'static',
            resolve: {
            }
        });

        modalInstance.result.then(function (cedula) {
            vm.cedulas.push(cedula);
        }, function () {
            //$log.info('Modal dismissed at: ' + new Date());
        });
    }

    vm.SeleccionarPartes = function () {
        vm.Tramite = new Tramite08();
        vm.Tramite.AmbasPartes = true;
        vm.Tramite.origenSite = appConfig.origenSite;

        if (session.len() <= 0)
            session.add(vm.Tramite);
        else {
            if (session.get(0).esMandatario) {
                vm.Tramite = session.get(0);
                vm.Tramite.AmbasPartes = true;
            }
            session.set(0, vm.Tramite);
        }

        $location.path("/vendedores");
    }

    vm.DatosOperacionStep = function () {
        vm.formErrors = [];

        if (vm.cedulas.length <= 0) {
            //vm.formErrors.push('Debe agregar por lo menos una cédula adicional y/o autorizado, si no desea solicitar ninguna, presione Cancelar');
            vm.formErrors.push('Debe agregar por lo menos una cédula adicional, si no desea solicitar ninguna, presione Cancelar');
            return;
        }

        session.set(0, vm.Tramite);
        $location.path("/compradores/datoscompra");
    }

    vm.GravamenesStep = function () {

        vm.Tramite.PrecioCompra = vm.PrecioCompra;
        vm.Tramite.Uso = vm.Uso;
        vm.Tramite.Concepto = vm.Concepto;
        vm.Tramite.CETA = vm.ceta;

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            //PRESUPUESTO
            recaptchaCallback = function (token) {
                SITE.obtenerPresupuestoYMediosDePago(
                    {
                        RecaptchaResponse: token,
                        Operacion: OperacionEnum.Turno,
                        IdTipoCaracterSolicitante: 1,
                        Dominio: vm.Tramite.Dominio,
                        CodigoRegistro: vm.Tramite.CodigoRegistro,
                        CodigoTramite: vm.Tramite.CodigoTramite,
                        EsMandatario: vm.Tramite.esMandatario,
                        NroCPD: vm.Tramite.NroCPD,
                        MandatarioCertificaFirma: 0,
                        MandatarioRequiereF13I: 0,
                        CantidadCedulasAutorizados: vm.Tramite.Cedulas ? vm.Tramite.Cedulas.length : 0,
                        Precarga: { ValorDeclarado: vm.PrecioCompra }
                    },
                    function (data) {
                        grecaptcha.reset();

                        vm.Tramite.Pago = {};

                        vm.Tramite.Pago.bancos = data.Bancos;
                        vm.Tramite.Pago.redes = data.Redes;
                        vm.Tramite.Pago.presupuesto = data.Presupuesto;
                        vm.Tramite.Pago.registroVEPHabilitado = data.RegistroVEPHabilitado;
                        vm.Tramite.Pago.registroPagoMisCuentasHabilitado = data.RegistroPagoMisCuentasHabilitado;
                        vm.Tramite.Pago.registroTurnoPagoHabilitado = data.RegistroTurnoPagoHabilitado;
                        vm.Tramite.Pago.medioDePagoNombre = data.MedioDePagoNombre;
                        vm.Tramite.Pago.medioDePagoDescripcion = data.MedioDePagoDescripcion;
                        vm.Tramite.Pago.medioDePagoDescripcionDetallada = data.MedioDePagoDescripcionDetallada;

                        session.set(0, vm.Tramite);
                        $location.path("/seleccionarTurno08D");
                        return;
                    },
                    function () {
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
            //FIN:PRESUPUESTO

            //session.set(0, vm.Tramite);
            //$location.path("/seleccionarTurno08D");
        }
    }

    vm.finalizar = function () {

        vm.formErrors = [];
        if (vm.compradores.length <= 0) {
            vm.formErrors.push('Debe ingresar a los compradores para continuar el trámite de Transferencia');
            return;
        }

        var sumaCompradores = 0;
        for (var i = 0; i < vm.Tramite.Compradores.length; i++) {
            sumaCompradores += vm.Tramite.Compradores[i].PorcentajeBien;
        }

        var sumaVendedores = 0;
        for (var i = 0; i < vm.Tramite.Vendedores.length; i++) {
            sumaVendedores += vm.Tramite.Vendedores[i].PorcentajeBien;
        }

        if (Math.round(sumaVendedores) !== Math.round(sumaCompradores)) {
            vm.formErrors.push('La Suma de Porcentajes de los Vendedores debe ser Igual a la Suma de Porcentajes de los Compradores');
            return;
        }

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            session.set(0, vm.Tramite);

            $location.path("/compradores/datoscompra");
          

        }
    }

    vm.confirmar = function () {
        vm.formErrors = [];

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {

            //MANEJO PAGO
            vm.Tramite.Pago.MedioPago = vm.Tramite.Pago.registroVEPHabilitado ? 1004 : 1000;
            vm.Tramite.Pago.medioPagoNombre = vm.Tramite.Pago.registroVEPHabilitado ? 'Volante electrónico de pago (VEP)' : 'Pago Mis Cuentas';
            if (vm.Tramite.Pago.CodigoBanco) {
                vm.Tramite.Pago.nombreBanco = $filter('filter')(vm.Tramite.Pago.bancos, { Key: vm.Tramite.Pago.CodigoBanco })[0].Value;
            }
            if (vm.Tramite.Pago.CodigoRed) {
                vm.Tramite.Pago.nombreRed = $filter('filter')(vm.Tramite.Pago.redes, { Key: vm.Tramite.Pago.CodigoRed })[0].Value;
            }

            //Parche para e-pagos
            if (vm.Tramite.Pago.FormaPago == '3') {
                vm.Tramite.Pago.FormaPago = 1;
                vm.Tramite.Pago.MedioPago = 1006;
                vm.Tramite.Pago.medioPagoNombre = 'E-Pagos';
            }

            //FIN:MANEJO PAGO

            vm.esSiteRegistro = typeof ($rootScope.claims) !== "undefined" && $rootScope.claims !== "";

            if (vm.esSiteRegistro) {
                Comprador.saveList(vm.Tramite)
                    .$promise
                    .then(function (data) {
                        vm.Tramite.data = data;
                        session.set(0, vm.Tramite);
                        var solicitud = session.get(1);
                        if (typeof (solicitud) !== "undefined") {
                            if (solicitud.solicitante.esMandatario || solicitud.solicitante.esEscribano) {
                                modalInstance = $uibModal.open({
                                    animation: true,
                                    templateUrl: 'app/modules/mandatario/impresion.html',
                                    controller: ['$scope', '$uibModalInstance', 'session', 'Formulario08D', function ($scope, $uibModalInstance, session, Formulario08D) {
                                        Formulario08D.recuperar({ nroPrecarga: data.NroPrecarga, cuit: tramite.cuitMandatario }, function (data1) {
                                            $scope.form = data1;
                                        },
                                            function (error) {
                                                $scope.formErrors = [];
                                                if (error.data.ModelState) {
                                                    if (error.data.ModelState.captchaText) {
                                                        $scope.formErrors.push(error.data.ModelState.captchaText[0]);
                                                    }
                                                }
                                                else {
                                                    $scope.formErrors.push(error.data.ExceptionMessage);
                                                }
                                            });

                                        $scope.imprimirForm = function (key) {

                                            var leftPosition = (screen.width) ? (screen.width - 1250) / 2 : 0;
                                            var topPosition = (screen.height) ? (screen.height - 1250) / 2 : 0;

                                            var settings = "toolbar=no,scrollbars=yes,location=no,statusbar=no,menubar=no,resizable=yes,width=1050px, height=900px,left=" + leftPosition + "px,innerLeft=" + leftPosition + "px,top=" + topPosition + "px,innerTop=" + topPosition + "px";
                                            var url = "app/modules/mandatario/impresionFormulario.html";

                                            popUp = window.open(url, "_blank", settings);
                                            popUp.DataToShare = $scope.form.Formularios[key];
                                            popUp.focus();
                                        }

                                        $scope.terminar = function () {
                                            $uibModalInstance.dismiss();
                                        }

                                        $scope.close = function () {
                                            $uibModalInstance.dismiss('cancel');
                                        }
                                    }],
                                    controllerAs: 'impresionCtrl',
                                    backdrop: 'static',
                                    resolve: {
                                        session: function () {
                                            return session;
                                        }
                                    }
                                });
                                modalInstance.result.then(function (rta) {
                                    $location.path("/compradores/final");
                                }, function () {
                                    $location.path("/compradores/final");
                                });
                            }
                            else {
                                $location.path("/compradores/final");
                            }
                        }
                        else {
                            $location.path("/compradores/final");
                        }

                    }, function (error) {
                        vm.formErrors = [];
                        if (error.data.ModelState) {
                            if (error.data.ModelState.captchaText) {
                                vm.formErrors.push(error.data.ModelState.captchaText[0]);
                            }
                        }
                        else {
                            vm.formErrors.push(error.data.ExceptionMessage);
                        }
                    });
            }
            else {
                recaptchaCallback = function (token) {
                    vm.Tramite.ReCaptchaResponse = token;
                    Comprador.saveList(vm.Tramite)
                        .$promise
                        .then(function (data) {
                            grecaptcha.reset();

                            console.log(vm.Tramite);
                            vm.Tramite.data = data;
                            session.set(0, vm.Tramite);
                            var dato = vm.Tramite;

                            if (vm.Tramite.data.ErrorPago) {
                                vm.Tramite.ReintentarPago = true;
                                $window.scrollTo(0, 0);
                                return;
                            } else {
                                vm.Tramite.ReintentarPago = false;
                            }

                            var sesionId = 1;
                            if (dato.esEscribano) {
                                sesionId = 0;
                            }

                            //var solicitud = session.get(sesionId);
                            var solicitud = session.get(session.len() - 1);
                            console.log(solicitud);
                            if (typeof (solicitud) !== "undefined") {
                                if (solicitud.esMandatario || solicitud.esEscribano) {
                                    modalInstance = $uibModal.open({
                                        animation: true,
                                        templateUrl: 'app/modules/mandatario/impresion.html',
                                        controller: ['$scope', '$uibModalInstance', 'session', 'Formulario08D', function ($scope, $uibModalInstance, session, Formulario08D) {
                                            Formulario08D.recuperar({ nroPrecarga: data.NroPrecarga, cuit: solicitud.solicitante.esEscribano ? tramite.escribanoCuit : tramite.cuitMandatario }, function (data1) {
                                                $scope.form = data1;
                                            },
                                                function (error) {
                                                    $scope.formErrors = [];
                                                    if (error.data.ModelState) {
                                                        if (error.data.ModelState.captchaText) {
                                                            $scope.formErrors.push(error.data.ModelState.captchaText[0]);
                                                        }
                                                    }
                                                    else {
                                                        $scope.formErrors.push(error.data.ExceptionMessage);
                                                    }
                                                });

                                            $scope.imprimirForm = function (key) {

                                                var leftPosition = (screen.width) ? (screen.width - 1250) / 2 : 0;
                                                var topPosition = (screen.height) ? (screen.height - 1250) / 2 : 0;

                                                var settings = "toolbar=no,scrollbars=yes,location=no,statusbar=no,menubar=no,resizable=yes,width=1050px, height=900px,left=" + leftPosition + "px,innerLeft=" + leftPosition + "px,top=" + topPosition + "px,innerTop=" + topPosition + "px";
                                                var url = "app/modules/mandatario/impresionFormulario.html";

                                                popUp = window.open(url, "_blank", settings);
                                                popUp.DataToShare = $scope.form.Formularios[key];
                                                popUp.focus();
                                            }

                                            $scope.terminar = function () {
                                                $uibModalInstance.dismiss();
                                            }

                                            $scope.close = function () {
                                                $uibModalInstance.dismiss('cancel');
                                            }
                                        }],
                                        controllerAs: 'impresionCtrl',
                                        backdrop: 'static',
                                        resolve: {
                                            session: function () {
                                                return session;
                                            }
                                        }
                                    });
                                    modalInstance.result.then(function (rta) {
                                        $location.path("/compradores/final");
                                    }, function () {
                                        $location.path("/compradores/final");
                                    });
                                }
                                else {
                                    $location.path("/compradores/final");
                                }
                            }
                            else {
                                $location.path("/compradores/final");
                            }

                        }, function (error) {
                            vm.formErrors = [];
                            if (error.data.ModelState) {
                                if (error.data.ModelState.captchaText) {
                                    vm.formErrors.push(error.data.ModelState.captchaText[0]);
                                }
                            }
                            else {
                                vm.formErrors.push(error.data.ExceptionMessage);
                            }

                            grecaptcha.reset();
                        });
                };
                grecaptcha.execute();
            }
        }
    }

    vm.compradoresStep = function () {
        $location.path('/compradores/index');
    }

    vm.EliminarComprador = function (index) {
        vm.compradores.splice(index, 1);
    }

    vm.EliminarCedula = function (index) {
        vm.cedulas.splice(index, 1);
    }

    vm.EditarComprador = function (index) {
        var comprador = vm.compradores[index];
        vm.compradores.splice(index, 1);

        session.remove(1);
        session.add(comprador)

        switch (comprador.Tipo) {
            case "F": $location.path('/compradores/newph'); break;
            case "J": $location.path('/compradores/newpj'); break;
            case "E": $location.path('/compradores/newsh'); break;
            default:

        }
    }

    vm.calcularTotalPresupuesto = function () {
        var total = 0;
        angular.forEach(vm.Tramite.Pago.presupuesto.DetallePrecioPrecargaViewModel, function (value, key) {
            total += value.PrecioUnitario * value.Cantidad;
        });
        if (vm.Tramite.Pago.FormaPago === '3') {
            const descuento = vm.Tramite.Pago.presupuesto.DetallePrecioPrecargaViewModel[vm.Tramite.Pago.presupuesto.DetallePrecioPrecargaViewModel.length - 1].PrecioUnitario * vm.Tramite.Pago.presupuesto.DetallePrecioPrecargaViewModel[vm.Tramite.Pago.presupuesto.DetallePrecioPrecargaViewModel.length - 1].Cantidad;
            total -= descuento;
        }
        return total;
    };

    registerInterceptorValidationSummary($scope, vm, $window);

}