angular
    .module('webApp')
    .controller('precargaController', ['$rootScope', '$scope', '$window', '$location', '$uibModal', '$filter', 'session', 'SITE', 'precargaServices', 'digitales', precargaController]);

function precargaController($rootScope, $scope, $window, $location, $uibModal, $filter, session, SITE, precargaServices, digitales) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Ingresá los datos necesarios para completar los datos de la precarga.');

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.digitalOportunidad = false;
        vm.digitalSeleccion = false;
        vm.solicitud.precarga = null;
        vm.solicitud.vehiculoMarca = null;
        vm.solicitud.vehiculoModelo = null;
        vm.solicitud.vehiculoTipo = null;
        vm.solicitud.vehiculoAnio = null;
        vm.solicitud.vehiculoOrigen = null;
        vm.solicitud.vehiculoValorTabla = null;
        vm.solicitud.valorPrenda = null;
        vm.solicitud.prendaCondicionada = null;

        vm.provincias = provincias;
        //SETEAR DATOS TITULAR SI SOLICITANTE ES EN CARACTER DE TITULAR
        if (vm.solicitud.requiereTitular && vm.solicitud.solicitante.idTipoCaracterSolicitante === '1') {
            vm.titularTipoPersona = 'F';
            vm.titularTipoDocumento = vm.solicitud.solicitante.tipoDocumento;
            vm.titularNumeroDocumento = vm.solicitud.solicitante.numeroDocumento;
            vm.titularApellido = vm.solicitud.solicitante.apellido;
            vm.titularNombre = vm.solicitud.solicitante.nombre;

            //PRESENTA OPCION DE TRAMITE 100% DIGITAL
            if (vm.solicitud.codigoTramite === '021700' || vm.solicitud.codigoTramite === '021702')
            {
                vm.digitalOportunidad = true;
            }
        }

        if (vm.solicitud.codigoTramite === '021703'
            || vm.solicitud.codigoTramite === '021704'
            || vm.solicitud.codigoTramite === '021700'
            || vm.solicitud.codigoTramite === '021701'
            || vm.solicitud.codigoTramite === '021702'
            || vm.solicitud.codigoTramite === '022023'
            || vm.solicitud.codigoTramite === '022047') {
            vm.cedulasAutorizados = [];
            vm.cedulasTitulares = [];
        } else {
            vm.cedulasAutorizados = null;
            vm.cedulasTitulares = null;
        }

        //SETEAR MASCARA DE CERTIFICADO DE INSCRIPCION INICIAL
        if (vm.solicitud.codigoTramite === '010000' || vm.solicitud.codigoTramite === '010105') {
            vm.certificadoMask = '999-999999999/9999';
        } else if (vm.solicitud.codigoTramite === '010103' || vm.solicitud.codigoTramite === '010205') {
            vm.certificadoMask = '99-9999999/9999';
        }
    }

    vm.submit = function () {
        vm.formErrors = [];
        //VALIDAR CANTIDAD CEDULAS VERDES - 021702 - EXPEDICIÓN DE CÉDULA PARA AUTORIZADO A CONDUCIR
        if (vm.solicitud.codigoTramite === '021702' && (!vm.cedulasTitulares || vm.cedulasTitulares.length < 1)) {
            vm.formErrors.push('Agrega al menos una <strong>Cédula Titular (Verde)</strong>.');
            $window.scrollTo(0, 0);
            return;
        }
        //FIN:VALIDAR CANTIDAD CEDULAS VERDES

        //VALIDAR CANTIDAD CEDULAS AZULES - 021703 - EXPEDICIÓN DE CÉDULA PARA AUTORIZADO A CONDUCIR / 021704 - REVOCACIÓN
        if (
            ((vm.solicitarExpediciones && vm.solicitarExpediciones === 'SI') || (vm.solicitud.codigoTramite === '021703' || vm.solicitud.codigoTramite === '021704'))
            &&
            (!vm.cedulasAutorizados || vm.cedulasAutorizados.length < 1)
        ) {
            vm.formErrors.push('Agrega al menos una <strong>Cédula Audicional</strong>.');
            $window.scrollTo(0, 0);
            return;
        }
        //FIN:VALIDAR CANTIDAD CEDULAS AZULES
        if (typeof vm.prenda !== 'undefined') {
            if (vm.solicitud.codigoTramite === '030999') {
                if (vm.solicitud.solicitante.numeroDocumento.toString() !== vm.prenda.cuit) {
                    vm.formErrors.push('El CPD no corresponde al CUIT del solicitante');
                    $window.scrollTo(0, 0);
                    return;
                }
            }
        }

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            //TURNO
            if (vm.solicitud.operacion === OperacionEnum.Turno || vm.solicitud.operacion === OperacionEnum.AsociacionesProfesionales || vm.solicitud.operacion === OperacionEnum.TramiteDigital) {
                vm.solicitud.precarga = new Precarga();

                if (vm.solicitud.operacion == OperacionEnum.Turno && vm.digitalSeleccion) {
                    vm.solicitud.operacion = OperacionEnum.TramiteDigital;
                }

                //NO CARGAR TITULAR EN INSCRIPCION INICIAL
                if (vm.solicitud.requiereTitular && (vm.titularNumeroDocumento || vm.titularCuit)) {
                    vm.solicitud.precarga.titular = new Titular();
                    vm.solicitud.precarga.titular.tipoPersona = vm.titularTipoPersona;
                    vm.solicitud.precarga.titular.tipoDocumento = vm.titularTipoDocumento;
                    vm.solicitud.precarga.titular.numeroDocumento = vm.titularNumeroDocumento;
                    vm.solicitud.precarga.titular.cuit = vm.titularCuit;
                }

                //020603 - INFORME NOMINAL
                //570300 - INFORME NOMINAL NACIONAL
                //570302 - INFORME NOMINAL HISTORICO NACIONAL
                //020606 - INFORME DE ANOTACIONES PERSONALES (ACE)
                //020900 - CERTIFICADO DE TRANSFERENCIA
                if (vm.solicitud.codigoTramite === '020603' || vm.solicitud.codigoTramite === '570300' || vm.solicitud.codigoTramite === '570302' || vm.solicitud.codigoTramite === '020606' || vm.solicitud.codigoTramite === '020900') {
                    vm.solicitud.precarga.titular = new Titular();
                    vm.solicitud.precarga.titular.apellido = vm.titularApellido;
                    vm.solicitud.precarga.titular.nombre = vm.titularNombre;
                    vm.solicitud.precarga.titular.tipoPersona = vm.titularTipoPersona;
                    vm.solicitud.precarga.titular.tipoDocumento = vm.titularTipoDocumento;
                    vm.solicitud.precarga.titular.numeroDocumento = vm.titularNumeroDocumento;
                    vm.solicitud.precarga.titular.cuitCuil = vm.titularCuitCuil;
                    vm.solicitud.precarga.titular.cuit = vm.titularCuit;
                    vm.solicitud.precarga.titular.razonSocial = vm.titularRazonSocial;
                }

                //COMPRADOR
                if (vm.solicitud.codigoTramite === '110000') {
                    vm.solicitud.precarga.comprador = new Comprador();
                    vm.solicitud.precarga.comprador.fechaEntrega = vm.denunciaVentaFecha;
                    vm.solicitud.precarga.comprador.lugar = vm.denunciaVentaLugar;
                    vm.solicitud.precarga.comprador.codigoPersona = vm.compradorTipoPersona;
                    vm.solicitud.precarga.comprador.tipoDocumento = vm.compradorTipoDocumento;
                    vm.solicitud.precarga.comprador.numeroDocumento = vm.compradorNumeroDocumento;
                    vm.solicitud.precarga.comprador.apellido = vm.compradorApellido;
                    vm.solicitud.precarga.comprador.nombre = vm.compradorNombre;
                    vm.solicitud.precarga.comprador.cuit = vm.compradorCuit;
                    vm.solicitud.precarga.comprador.razonSocial = vm.compradorRazonSocial;
                    vm.solicitud.precarga.comprador.cargarDomicilio = vm.compradorCargarDomicilio;
                    vm.solicitud.precarga.comprador.provincia = vm.compradorProvincia;
                    vm.solicitud.precarga.comprador.partido = vm.compradorPartido;
                    vm.solicitud.precarga.comprador.localidad = vm.compradorLocalidad;
                    vm.solicitud.precarga.comprador.codigoPostal = vm.compradorCodigoPostal;
                    vm.solicitud.precarga.comprador.barrio = vm.compradorBarrio;
                    vm.solicitud.precarga.comprador.calle = vm.compradorCalle;
                    vm.solicitud.precarga.comprador.numero = vm.compradorNumero;
                    vm.solicitud.precarga.comprador.piso = vm.compradorPiso;
                    vm.solicitud.precarga.comprador.departamento = vm.compradorDepartamento;
                }

                vm.solicitud.precarga.motivo = vm.motivo;
                vm.solicitud.precarga.solicitarExpediciones = vm.solicitarExpediciones;

                //MANEJO CEDULAS TITULARES - 021702 - EXPEDICIÓN ADICIONAL DE CÉDULA
                var cantidadCedulasTitulares = 0;
                if (vm.cedulasTitulares && vm.cedulasTitulares.length > 0) {
                    vm.solicitud.precarga.cedulasTitulares = vm.cedulasTitulares;
                    cantidadCedulasTitulares = vm.cedulasTitulares.length;
                    if (vm.solicitud.codigoTramite === '021702') {
                        cantidadCedulasTitulares--;
                    }
                }
                //FIN:MANEJO CEDULAS TITULARES

                //MANEJO CEDULAS AUTORIZADOS
                var cantidadCedulasAutorizados = 0;
                if (vm.cedulasAutorizados && vm.cedulasAutorizados.length > 0) {
                    vm.solicitud.precarga.cedulasAutorizados = vm.cedulasAutorizados;
                    //EN REVOCACION DE CEDULA PARA AUTORIZADO A CONDUCIR NO PASAMOS LA CANTIDAD DE CEDULAS A REVOCAR, ESE NUMERO ES SOLO PARA EXPEDIR
                    if (vm.solicitud.codigoTramite !== '021704') {
                        cantidadCedulasAutorizados = vm.solicitud.precarga.cedulasAutorizados.length;
                        //EN EXPEDICION DE CEDULA PARA AUTORIZADO A CONDUCIR RESTAMOS 1 PORQUE POR EL ITEM DEL TRAMITE YA COBRAMOS 1 CEDULA LAS RESTANTES SALEN POR OTRO ITEM
                        if (vm.solicitud.codigoTramite === '021703') {
                            cantidadCedulasAutorizados--;
                        }
                    }

                }
                //FIN:MANEJO CEDULAS AUTORIZADOS

                //022009 - ANOTACIÓN DE ENDOSO
                //022012 - CANCELACIÓN DE PRENDA
                //022014 - MODIFICACIÓN DE PRENDA
                //030000 - INSCRIPCION DE PRENDA
                if (vm.solicitud.codigoTramite === '022009' ||
                    vm.solicitud.codigoTramite === '022012' ||
                    vm.solicitud.codigoTramite === '022014' ||
                    vm.solicitud.codigoTramite === '030000' ||
                    vm.solicitud.codigoTramite === '030999') {

                    vm.solicitud.precarga.numeroChasis = vm.numeroChasis;
                    vm.solicitud.precarga.idTramitePosteriorPrendaNumero = vm.numeroEndoso;
                    vm.solicitud.precarga.certificadoPrendaNumero = vm.numeroCPD;

                }

                //010000 - INSCRIPCION INICIAL DE CERO KILOMETRO NACIONAL (AUTOMOTOR)
                //010103 - INSCRIPCION INICIAL DE CERO KILOMETRO IMPORTADO (AUTOMOTOR)
                //010105 - INSCRIPCION INICIAL DE CERO KILOMETRO NACIONAL (MOTOVEHICULO)
                //010205 - INSCRIPCION INICIAL DE CERO KILOMETRO IMPORTADO (MOTOVEHICULO)
                if (vm.solicitud.codigoTramite === '010998') {
                    //vm.solicitud.precarga.certificadoInscripcionPartida = vm.certificadoInscripcionPartida;
                    vm.solicitud.precarga.certificadoInscripcionNumero = vm.certificadoInscripcionNumero;
                    //vm.solicitud.precarga.certificadoInscripcionAnio = vm.certificadoInscripcionAnio;
                    vm.solicitud.precarga.numeroChasis = vm.numeroChasis;
                    vm.solicitud.precarga.valorDeclarado = vm.valorDeclarado;
                }

                //010999 - INSCRIPCION INICIAL DE CERO KILOMETRO CON PRENDA DIGITAL

                if (vm.solicitud.codigoTramite === '010999') {
                    vm.solicitud.precarga.certificadoInscripcionNumero = vm.certificadoInscripcionNumero;
                    vm.solicitud.precarga.numeroChasis = vm.numeroChasis;
                    vm.solicitud.precarga.valorDeclarado = vm.valorDeclarado;
                    vm.solicitud.precarga.certificadoPrendaNumero = vm.certificadoPrendaNumero;
                    //vm.solicitud.precarga.prendaCondicionada = vm.prendaCondicionada === 'SI';

                    //MODAL VALIDAR PRECARGA
                    var confirmValidarPrecarga = function (data) {
                        var modalValidarPrecarga = $uibModal.open({
                            animation: true,
                            templateUrl: 'app/modules/solicitudes/modalValidarPrenda.html',
                            controller: ['$scope', '$uibModalInstance', function ($modalscope, $uibModalInstance) {
                                var vmModal = this;

                                vmModal.inscripcion = data.ValidarInscripcionInicialResponseViewModel;
                                vmModal.prenda = data.ValidarPrendaDigitalResponseViewModel;

                                vmModal.submit = function () {
                                    vmModal.formErrors = [];

                                    $modalscope.$broadcast('show-errors-check-validity', 'form');

                                    if (vmModal.prenda.MonedaEsPesos) {
                                        vm.solicitud.precarga.prendaCondicionada = vmModal.prenda.Condicionada;
                                        vm.solicitud.precarga.valorPrenda = vmModal.prenda.Monto;
                                        $uibModalInstance.close(true);
                                    }
                                    else if (vmModal.form.$valid) {
                                        vm.solicitud.precarga.prendaCondicionada = vmModal.prenda.Condicionada;
                                        vm.solicitud.precarga.valorPesos = vmModal.valorPesos;
                                        vm.solicitud.precarga.valorPrenda = vmModal.valorPesos;
                                        $uibModalInstance.close(true);
                                    }

                                };
                                vmModal.cerrar = function () {
                                    $uibModalInstance.dismiss('cancel');
                                };

                            }],
                            controllerAs: 'modalValidarPrendaCtrl',
                            backdrop: 'static',
                            size: 'lg'
                        });

                        modalValidarPrecarga.result.then(function (result) {
                            vm.obtenerPresupuesto(0, 0);
                        }, function () {
                            //$log.info('Modal dismissed at: ' + new Date());
                        });
                    };
                    //END:MODAL VALIDAR PRECARGA

                    vm.validarPrecarga(confirmValidarPrecarga);
                    return;
                }

                //999997 - PAGO / RECLAMO DE INFRACCIONES
                if (vm.solicitud.codigoTramite === '999997') {
                    vm.solicitud.precarga.dominioPrecargaRelacionada = vm.dominioPrecargaRelacionada;
                    vm.solicitud.precarga.numeroPrecargaRelacionada = vm.numeroPrecargaRelacionada;
                }

                //100000 - DENUNCIA DE COMPRA Y POSESION
                if (vm.solicitud.codigoTramite === '100000') {
                    vm.parseDenunciaCompra();
                }

                if (vm.solicitud.codigoTramite === '040703') {
                    vm.parseCambioDomicilioConPedido();
                }

                if (vm.solicitud.conPresupuesto) {
                    vm.obtenerPresupuesto(cantidadCedulasTitulares, cantidadCedulasAutorizados);
                    return;
                }

                if (vm.solicitud.excluyeDominio && vm.solicitud.excluyeRegistro) {
                    recaptchaCallback = function (token) {
                        SITE.validarPrecargaYObtenerTurnos(
                            {
                                RecaptchaResponse: token,
                                CodigoTramite: vm.solicitud.codigoTramite,
                                Precarga: vm.solicitud.armarObjetoParaPost().Precarga
                            },
                            function (data) {
                                grecaptcha.reset();
                                vm.solicitud.dominio = data.Dominio;
                                vm.solicitud.codigoVehiculo = data.Vehiculo;
                                vm.solicitud.codigoRegistroSeccional = data.CodigoRegistro;
                                vm.solicitud.registroDenominacion = data.RegistroDenominacion;
                                vm.solicitud.turnoToday = data.Turnos.hoy;
                                vm.solicitud.turnoStart = data.Turnos.inicio;
                                vm.solicitud.turnoEnd = data.Turnos.fin;
                                vm.solicitud.turnoDiasnolaborables = data.Turnos.diasNoLaborables;
                                vm.solicitud.dias = data.Turnos.dias;
                                $location.path('/seleccionarTurno');
                                return;
                            },
                            function () {
                                grecaptcha.reset();
                            });
                    };
                    grecaptcha.execute();
                    return;
                }

                vm.esSiteRegistro = typeof ($rootScope.claims) !== "undefined" && $rootScope.claims !== "";
                if (!vm.esSiteRegistro && !vm.digitalSeleccion) {
                    $location.path('/seleccionarTurno');
                }
                else {
                    recaptchaCallback = function (token) {
                        SITE.finalizar({ Solicitud: vm.solicitud.armarObjetoParaPost(), RecaptchaResponse: token },
                            function (data) {
                                grecaptcha.reset();
                                vm.solicitud.ErrorPago = data.ErrorPago;
                                vm.solicitud.numeroVEP = data.numeroVEP;
                                vm.solicitud.numeroPagoMisCuentas = data.numeroPagoMisCuentas;
                                vm.solicitud.numeroPrecarga = data.NumeroPrecarga;
                                vm.solicitud.codigoParaServicios = data.CodigoParaServicios;
                                vm.solicitud.horasValidez = data.HorasValidez;

                                if (data.ErrorPago) {
                                    $location.path('/pago');
                                    return;
                                } else {
                                    if (vm.solicitud.codigoTramite === '040703') {
                                        $location.path('/seleccionarRegistro');
                                    }
                                    else {
                                        $location.path('/finalizar');
                                    }
                                }
                            },
                            function () {
                                $window.scrollTo(0, 0);
                                grecaptcha.reset();
                            });
                    };
                    grecaptcha.execute();
                }
                return;
            }
        }
    };

    vm.parseDenunciaCompra = function () {
        vm.solicitud.precarga.denunciaCompra = {
            titularTipoPersona: vm.titularTipoPersona,
            titularApellido: vm.titularApellido,
            titularNombre: vm.titularNombre,
            titularTipoDocumento: 8,
            titularNumeroDocumento: vm.titularNumeroDocumento,
            titularSexo: vm.titularSexo,
            titularNacionalidad: vm.titularNacionalidad,
            titularFechaNacimiento: vm.titularFechaNacimiento,
            titularOcupacion: vm.titularOcupacion,
            titularEstadoCivil: vm.titularEstadoCivil,
            titularConyugeApellido: vm.titularConyugeApellido,
            titularConyugeNombre: vm.titularConyugeNombre,
            titularConyugeTipoDocumento: 8,
            titularConyugeNumeroDocumento: vm.titularConyugeNumeroDocumento,
            titularCuit: vm.titularCuit,
            titularRazonSocial: vm.titularRazonSocial,
            titularProvinciaInscripcion: vm.titularProvinciaInscripcion,
            titularFechaConstitucion: vm.titularFechaConstitucion,
            titularDomicilioLegalProvincia: vm.titularDomicilioLegalProvincia,
            titularDomicilioLegalPartido: vm.titularDomicilioLegalPartido,
            titularDomicilioLegalLocalidad: vm.titularDomicilioLegalLocalidad,
            titularDomicilioLegalCodigoPostal: vm.titularDomicilioLegalCodigoPostal,
            titularDomicilioLegalCalle: vm.titularDomicilioLegalCalle,
            titularDomicilioLegalNumero: vm.titularDomicilioLegalNumero,
            titularDomicilioLegalPiso: vm.titularDomicilioLegalPiso,
            titularDomicilioLegalDepartamento: vm.titularDomicilioLegalDepartamento,
            titularDomicilioLegalIgualDomicilioReal: vm.titularDomicilioLegalIgualDomicilioReal,
            titularDomicilioRealProvincia: vm.titularDomicilioRealProvincia,
            titularDomicilioRealPartido: vm.titularDomicilioRealPartido,
            titularDomicilioRealLocalidad: vm.titularDomicilioRealLocalidad,
            titularDomicilioRealCodigoPostal: vm.titularDomicilioRealCodigoPostal,
            titularDomicilioRealCalle: vm.titularDomicilioRealCalle,
            titularDomicilioRealNumero: vm.titularDomicilioRealNumero,
            titularDomicilioRealPiso: vm.titularDomicilioRealPiso,
            titularDomicilioRealDepartamento: vm.titularDomicilioRealDepartamento,
            denunciaCompraFecha: vm.denunciaCompraFecha,
            denunciaCompraValor: vm.denunciaCompraValor,
            denunciaCompraLugarProvincia: vm.denunciaCompraLugarProvincia,
            denunciaCompraLugarPartido: vm.denunciaCompraLugarPartido,
            denunciaCompraLugarLocalidad: vm.denunciaCompraLugarLocalidad,
            denunciaCompraLugarCodigoPostal: vm.denunciaCompraLugarCodigoPostal,
            denunciaCompraLugarCalle: vm.denunciaCompraLugarCalle,
            denunciaCompraLugarNumero: vm.denunciaCompraLugarNumero,
            denunciaCompraLugarPiso: vm.denunciaCompraLugarPiso,
            denunciaCompraLugarDepartamento: vm.denunciaCompraLugarDepartamento,
            vendedorTipoPersona: vm.vendedorTipoPersona,
            vendedorApellido: vm.vendedorApellido,
            vendedorNombre: vm.vendedorNombre,
            vendedorTipoDocumento: 8,
            vendedorNumeroDocumento: vm.vendedorNumeroDocumento,
            vendedorCuit: vm.vendedorCuit,
            vendedorRazonSocial: vm.vendedorRazonSocial,
            denunciaCompraDescripcion: vm.denunciaCompraDescripcion,
            verificacionPolicialExiste: vm.verificacionPolicialExiste,
            numeroVerificacionPolicial: vm.numeroVerificacionPolicial,
            cetaExiste: vm.cetaExiste,
            numeroCETA: vm.numeroCETA
        };
    };

    vm.parseCambioDomicilioConPedido = function () {
        vm.solicitud.precarga.denunciaCompra = {
            titularDomicilioLegalProvincia: vm.titularDomicilioLegalProvincia,
            titularDomicilioLegalPartido: vm.titularDomicilioLegalPartido,
            titularDomicilioLegalLocalidad: vm.titularDomicilioLegalLocalidad,
            titularDomicilioLegalCodigoPostal: vm.titularDomicilioLegalCodigoPostal,
            titularDomicilioLegalCalle: vm.titularDomicilioLegalCalle,
            titularDomicilioLegalNumero: vm.titularDomicilioLegalNumero,
            titularDomicilioLegalPiso: vm.titularDomicilioLegalPiso,
            titularDomicilioLegalDepartamento: vm.titularDomicilioLegalDepartamento,
            titularDomicilioLegalIgualDomicilioReal: vm.titularDomicilioLegalIgualDomicilioReal,
            titularDomicilioRealProvincia: vm.titularDomicilioRealProvincia,
            titularDomicilioRealPartido: vm.titularDomicilioRealPartido,
            titularDomicilioRealLocalidad: vm.titularDomicilioRealLocalidad,
            titularDomicilioRealCodigoPostal: vm.titularDomicilioRealCodigoPostal,
            titularDomicilioRealCalle: vm.titularDomicilioRealCalle,
            titularDomicilioRealNumero: vm.titularDomicilioRealNumero,
            titularDomicilioRealPiso: vm.titularDomicilioRealPiso,
            titularDomicilioRealDepartamento: vm.titularDomicilioRealDepartamento
        };
    };

    vm.validarPrecarga = function (success) {
        recaptchaCallback = function (token) {
            SITE.validarPrecarga(
                {
                    RecaptchaResponse: token,
                    CodigoTramite: vm.solicitud.codigoTramite,
                    CodigoVehiculo: vm.solicitud.codigoVehiculo,
                    CodigoRegistro: vm.solicitud.codigoRegistroSeccional,
                    Precarga: vm.solicitud.armarObjetoParaPost().Precarga
                },
                function (data) {
                    grecaptcha.reset();
                    success(data);
                    return;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    vm.obtenerPresupuesto = function (cantidadCedulasTitulares, cantidadCedulasAutorizados) {
        recaptchaCallback = function (token) {
            SITE.obtenerPresupuestoYMediosDePago(
                {
                    RecaptchaResponse: token,
                    Operacion: vm.solicitud.operacion,
                    IdTipoCaracterSolicitante: vm.solicitud.solicitante.idTipoCaracterSolicitante,
                    Dominio: vm.solicitud.dominio,
                    CodigoRegistro: (vm.solicitud.codigoTramite === '570300' || vm.solicitud.codigoTramite === '570302' || vm.solicitud.codigoTramite === '020606') ? 2001 : vm.solicitud.codigoRegistroSeccional,
                    CodigoTramite: vm.solicitud.codigoTramite,
                    CodigoVehiculo: vm.solicitud.codigoVehiculo,
                    CantidadCedulasTitulares: cantidadCedulasTitulares,
                    CantidadCedulasAutorizados: cantidadCedulasAutorizados,
                    Precarga: vm.solicitud.armarObjetoParaPost().Precarga,
                    EsMandatario: vm.solicitud.esMandatario ? vm.solicitud.esMandatario : false,
                    MandatarioCertificaFirma: vm.solicitud.mandatarioCertificaFirma ? vm.solicitud.mandatarioCertificaFirma : 0,
                    MandatarioRequiereF13I: vm.solicitud.mandatarioRequiereF13I ? vm.solicitud.mandatarioRequiereF13I : 0,
                    NroCPD: vm.solicitud.precarga.certificadoPrendaNumero
                },
                function (data) {
                    grecaptcha.reset();
                    vm.solicitud.bancos = data.Bancos;
                    vm.solicitud.redes = data.Redes;
                    vm.solicitud.presupuesto = data.Presupuesto;
                    vm.solicitud.registroVEPHabilitado = data.RegistroVEPHabilitado;
                    vm.solicitud.registroPagoMisCuentasHabilitado = data.RegistroPagoMisCuentasHabilitado;
                    vm.solicitud.registroTurnoPagoHabilitado = data.RegistroTurnoPagoHabilitado;

                    vm.solicitud.medioDePagoNombre = data.MedioDePagoNombre;
                    vm.solicitud.medioDePagoDescripcion = data.MedioDePagoDescripcion;
                    vm.solicitud.medioDePagoDescripcionDetallada = data.MedioDePagoDescripcionDetallada;

                    if (data.Certificado) {
                        vm.solicitud.vehiculoMarca = data.Certificado.Marca;
                        vm.solicitud.vehiculoModelo = data.Certificado.Modelo;
                        vm.solicitud.vehiculoTipo = data.Certificado.Tipo;
                        vm.solicitud.vehiculoAnio = data.Certificado.Anio;
                        vm.solicitud.vehiculoOrigen = data.Certificado.Origen;
                        vm.solicitud.vehiculoValorTabla = data.Certificado.ValorTabla;
                    }

                    if (vm.solicitud.codigoTramite === '040703') {
                        $location.path('/seleccionarRegistro');
                    }
                    else {
                        $location.path('/pago');
                    }
                    return;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    //CEDULAS
    vm.agregarCedulaTitular = function () {
        var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/solicitudes/cedula.html',
            controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
                vmModal = this;
                //var tramite = session.get(0);
                //$scope.Compradores = tramite.Compradores || [];

                vmModal.tipo = 'CT';
                vmModal.codigoTramite = vm.solicitud.codigoTramite;

                vmModal.aceptar = function () {
                    $scope.$broadcast('show-errors-check-validity', 'form');
                    if (!vmModal.form.$valid) {
                        return;
                    }

                    var cedula = new Cedula();

                    cedula.tipoPersona = vmModal.tipoPersona;
                    cedula.tipoDocumento = vmModal.tipoDocumento;
                    cedula.numeroDocumento = vmModal.numeroDocumento;
                    cedula.cuit = vmModal.cuit;

                    $uibModalInstance.close(cedula);
                }

                vmModal.close = function () {
                    $uibModalInstance.dismiss('cancel');
                }
            }],
            controllerAs: 'legalCtrl',
            backdrop: 'static',
            resolve: {
            }
        });

        modalInstance.result.then(function (cedula) {
            vm.cedulasTitulares.push(cedula);
        }, function () {
            //$log.info('Modal dismissed at: ' + new Date());
        });
    }

    vm.agregarCedulaAutorizado = function () {
        var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/solicitudes/cedula.html',
            controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
                vmModal = this;
                //var tramite = session.get(0);
                //$scope.Compradores = tramite.Compradores || [];

                vmModal.tipo = 'CA';
                vmModal.codigoTramite = vm.solicitud.codigoTramite;
                vmModal.tipoPersona = 'F';

                vmModal.aceptar = function () {
                    $scope.$broadcast('show-errors-check-validity', 'form');
                    if (!vmModal.form.$valid) {
                        return;
                    }

                    var cedula = new Cedula();

                    cedula.tipoPersona = vmModal.tipoPersona;
                    cedula.tipoDocumento = vmModal.tipoDocumento;
                    cedula.numeroDocumento = vmModal.numeroDocumento;
                    cedula.apellido = vmModal.apellido;
                    cedula.nombre = vmModal.nombre;

                    $uibModalInstance.close(cedula);
                }

                vmModal.close = function () {
                    $uibModalInstance.dismiss('cancel');
                }
            }],
            controllerAs: 'legalCtrl',
            backdrop: 'static',
            resolve: {
            }
        });

        modalInstance.result.then(function (cedula) {
            vm.cedulasAutorizados.push(cedula);
        }, function () {
            //$log.info('Modal dismissed at: ' + new Date());
        });
    }

    vm.tramiteDigital = function () {
        var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/solicitudes/popConfirmacionDigital.html',
            controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
                vmModal = this;
                vmModal.codigoTramite = vm.solicitud.codigoTramite;

                vmModal.aceptar = function () {
                    $uibModalInstance.close(true);
                }

                vmModal.close = function () {
                    $uibModalInstance.close(false);
                }
            }],
            controllerAs: 'legalCtrl',
            backdrop: 'static',
            resolve: {
            }
        });

        modalInstance.result.then(function (seleccion) {
            vm.digitalOportunidad = false;
            vm.digitalSeleccion = seleccion;
        }, function () {
            //$log.info('Modal dismissed at: ' + new Date());
        });
    }

    vm.tramitePresencial = function () {
        var modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/solicitudes/popPresencial.html',
            controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
                vmModal = this;
                vmModal.codigoTramite = vm.solicitud.codigoTramite;

                vmModal.aceptar = function () {
                    $uibModalInstance.close();
                }
            }],
            controllerAs: 'legalCtrl',
            backdrop: 'static',
            resolve: {
            }
        });

        modalInstance.result.then(function () {
            vm.digitalOportunidad = false;
            vm.digitalSeleccion = false;
        }, function () {
            //$log.info('Modal dismissed at: ' + new Date());
        });
    }

    vm.eliminarCedulaTitular = function (index) {
        vm.cedulasTitulares.splice(index, 1);
    }

    vm.eliminarCedulaAutorizado = function (index) {
        vm.cedulasAutorizados.splice(index, 1);
    }

    vm.TipoDocumento = function (tipoDoc) {
        switch (tipoDoc) {
            case "1": return "DNI";
            case "2": return "Libreta Enrolamiento";
            case "3": return "Libreta Cívica";
            case "4": return "DNI Extranjero";
            case "5": return "Cédula Extranjero";
            case "6": return "Pasaporte";
            case "8": return "CUIT";
            default:
                return "";
        }
    }
    //FIN:CEDULAS

    vm.titularDomicilioLegalProvinciaChanged = function () {
        if (vm.titularDomicilioLegalProvincia === "C") {
            vm.titularDomicilioLegalPartido = "CABA";
            vm.titularDomicilioLegalLocalidad = "CABA";
        } else {
            vm.titularDomicilioLegalPartido = "";
            vm.titularDomicilioLegalLocalidad = "";
        }
    };

    vm.titularDomicilioRealProvinciaChanged = function () {
        if (vm.titularDomicilioRealProvincia === "C") {
            vm.titularDomicilioRealPartido = "CABA";
            vm.titularDomicilioRealLocalidad = "CABA";
        } else {
            vm.titularDomicilioRealPartido = "";
            vm.titularDomicilioRealLocalidad = "";
        }
    };

    vm.denunciaCompraLugarProvinciaChanged = function () {
        if (vm.denunciaCompraLugarProvincia === "C") {
            vm.denunciaCompraLugarPartido = "CABA";
            vm.denunciaCompraLugarLocalidad = "CABA";
        } else {
            vm.denunciaCompraLugarPartido = "";
            vm.denunciaCompraLugarLocalidad = "";
        }
    };

    vm.validarDatosPrendaDigital = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');

        if (vm.solicitud.codigoTramite === '030999') {
            vm.validarInscripcionPrendaDigital();
            return;
        }

        if (vm.form.$valid) {
            precargaServices.validarPrecarga({ CDP: vm.numeroCPD, nroEndoso: vm.numeroEndoso, chasis: vm.numeroChasis })
                .$promise
                .then(function (data) {
                    vm.prenda = {};
                    vm.prenda.acreedor = data.acreedor;
                    vm.prenda.marca = data.marca;
                    vm.prenda.modelo = data.modelo;
                    vm.prenda.anio = data.anio;
                    vm.prenda.tipo = data.tipo;

                    vm.esValido = true;

                    return;
                },
                    function () {
                        grecaptcha.reset();
                        vm.esValido = false;
                    });
        }
    };

    vm.validarInscripcionPrendaDigital = function () {
        if (vm.form.$valid) {
            precargaServices.validarInscripcionPrenda({ CDP: vm.numeroCPD, chasis: vm.numeroChasis })
                .$promise
                .then(function (data) {
                    vm.prenda = {};
                    vm.prenda.acreedor = data.acreedor;
                    vm.prenda.marca = data.marca;
                    vm.prenda.modelo = data.modelo;
                    vm.prenda.anio = data.anio;
                    vm.prenda.tipo = data.tipo;
                    vm.prenda.cuit = data.cuit;

                    vm.esValido = true;

                    return;
                },
                    function () {
                        grecaptcha.reset();
                        vm.esValido = false;
                    });
        }
    };

    vm.esPrecargaDigital = function () {
        return digitales.esUnTramiteDigital(vm.solicitud.codigoTramite);
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}